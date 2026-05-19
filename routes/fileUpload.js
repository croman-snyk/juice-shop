/*
 * Copyright (c) 2014-2021 Bjoern Kimminich.
 * SPDX-License-Identifier: MIT
 */

const utils = require('../lib/utils')
const challenges = require('../data/datacache').challenges
const libxml = require('libxmljs2')
const os = require('os')
const vm = require('vm')
const fs = require('fs')
const unzipper = require('unzipper')
const path = require('path')

function matchesSystemIniFile (text) {
  const match = text.match(/(; for 16-bit app support|drivers|mci|driver32|386enh|keyboard|boot|display)/gi)
  return match && match.length >= 2
}

function matchesEtcPasswdFile (text) {
  const match = text.match(/\w*:\w*:\d*:\d*:\w*:.*/gi)
  return match && match.length >= 2
}

function ensureFileIsPassed ({ file }, res, next) {
  if (file) {
    next()
  }
}

function handleZipFileUpload ({ file }, res, next) {
  if (utils.endsWith(file.originalname.toLowerCase(), '.zip')) {
    if (file.buffer && !utils.disableOnContainerEnv()) {
      const buffer = file.buffer
      const tempFile = path.join(os.tmpdir(), 'temp_' + Date.now() + '.zip')
      fs.open(tempFile, 'w', function (err, fd) {
        if (err) { next(err) }
        fs.write(fd, buffer, 0, buffer.length, null, function (err) {
          if (err) { next(err) }
          fs.close(fd, function () {
            fs.createReadStream(tempFile)
              .pipe(unzipper.Parse())
              .on('entry', function (entry) {
                const fileName = entry.path
                if (path.isAbsolute(fileName)) {
                  entry.autodrain()
                  return
                }
                const normalizedFileName = path.normalize(fileName).replace(/^(\.\.[\/\\])+/, '')
                const targetDir = path.resolve('uploads/complaints/')
                const targetPath = path.join(targetDir, normalizedFileName)
                const resolvedPath = path.resolve(targetPath)
                utils.solveIf(challenges.fileWriteChallenge, () => { return resolvedPath === path.resolve('ftp/legal.md') })
                if (resolvedPath.startsWith(targetDir + path.sep)) {
                  entry.pipe(fs.createWriteStream(targetPath).on('error', function (err) { next(err) }))
                } else {
                  entry.autodrain()
                }
              }).on('error', function (err) { next(err) })
          })
        })
      })
    }
    res.status(204).end()
  } else {
    next()
  }
}

function checkUploadSize ({ file }, res, next) {
  utils.solveIf(challenges.uploadSizeChallenge, () => { return file.size > 100000 })
  next()
}

function checkFileType ({ file }, res, next) {
  const fileType = file.originalname.substr(file.originalname.lastIndexOf('.') + 1).toLowerCase()
  utils.solveIf(challenges.uploadTypeChallenge, () => {
    return !(fileType === 'pdf' || fileType === 'xml' || fileType === 'zip')
  })
  next()
}

function handleXmlUpload ({ file }, res, next) {
  if (utils.endsWith(file.originalname.toLowerCase(), '.xml')) {
    utils.solveIf(challenges.deprecatedInterfaceChallenge, () => { return true })
    if (file.buffer && !utils.disableOnContainerEnv()) { // XXE attacks in Docker/Heroku containers regularly cause "segfault" crashes
      const data = file.buffer.toString()
      try {
        const sandbox = { libxml, data }
        vm.createContext(sandbox)
        const xmlDoc = vm.runInContext('libxml.parseXml(data, { noblanks: true, noent: true, nocdata: true })', sandbox, { timeout: 2000 })
        const xmlString = xmlDoc.toString(false)
        utils.solveIf(challenges.xxeFileDisclosureChallenge, () => { return (matchesSystemIniFile(xmlString) || matchesEtcPasswdFile(xmlString)) })
        res.status(410)
        next(new Error('B2B customer complaints via file upload have been deprecated for security reasons: ' + utils.trunc(xmlString, 400) + ' (' + file.originalname + ')'))
      } catch (err) {
        if (utils.contains(err.message, 'Script execution timed out')) {
          if (utils.notSolved(challenges.xxeDosChallenge)) {
            utils.solve(challenges.xxeDosChallenge)
          }
          res.status(503)
          next(new Error('Sorry, we are temporarily not available! Please try again later.'))
        } else {
          res.status(410)
          next(new Error('B2B customer complaints via file upload have been deprecated for security reasons: ' + err.message + ' (' + file.originalname + ')'))
        }
      }
    } else {
      res.status(410)
      next(new Error('B2B customer complaints via file upload have been deprecated for security reasons (' + file.originalname + ')'))
    }
  }
  res.status(204).end()
}

module.exports = {
  ensureFileIsPassed,
  handleZipFileUpload,
  checkUploadSize,
  checkFileType,
  handleXmlUpload
}
