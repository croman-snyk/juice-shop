/*
 * Copyright (c) 2014-2021 Bjoern Kimminich.
 * SPDX-License-Identifier: MIT
 */

const utils = require('../lib/utils')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const models = require('../models/index')
const insecurity = require('../lib/insecurity')
const logger = require('../lib/logger')
const fileType = require('file-type')

module.exports = function fileUpload () {
  return (req, res, next) => {
    const file = req.file
    const buffer = file.buffer
    const uploadedFileType = fileType(buffer)
    if (uploadedFileType !== null && utils.startsWith(uploadedFileType.mime, 'image')) {
      const loggedInUser = insecurity.authenticatedUsers.get(req.cookies.token)
      if (loggedInUser) {
        const allowedExts = ['jpg', 'jpeg', 'png', 'gif', 'svg']
        if (!allowedExts.includes(uploadedFileType.ext)) {
          next(new Error('Invalid file extension'))
          return
        }
        const hashedId = crypto.createHash('sha256').update(String(loggedInUser.data.id)).digest('hex').substring(0, 16)
        const baseDir = path.join('frontend', 'dist', 'frontend', 'assets', 'public', 'images', 'uploads')
        const fileName = `${hashedId}.${uploadedFileType.ext}`
        const fullPath = path.join(baseDir, fileName)
        const resolvedPath = path.resolve(fullPath)
        if (!resolvedPath.startsWith(path.resolve(baseDir))) {
          next(new Error('Invalid file path'))
          return
        }
        fs.open(fullPath, 'w', function (err, fd) {
          if (err) logger.warn('Error opening file: ' + err.message)
          fs.write(fd, buffer, 0, buffer.length, null, function (err) {
            if (err) logger.warn('Error writing file: ' + err.message)
            fs.close(fd, function () { })
          })
        })
        models.User.findByPk(loggedInUser.data.id).then(user => {
          return user.update({ profileImage: `assets/public/images/uploads/${fileName}` })
        }).catch(error => {
          next(error)
        })
        res.location(process.env.BASE_PATH + '/profile')
        res.redirect(process.env.BASE_PATH + '/profile')
      } else {
        next(new Error('Blocked illegal activity by ' + req.connection.remoteAddress))
      }
    } else {
      res.status(415)
      next(new Error(`Profile image upload does not accept this file type${uploadedFileType ? (': ' + uploadedFileType.mime) : '.'}`))
    }
  }
}
