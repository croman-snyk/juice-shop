// Simple login function
export function login(username: string, password: string): boolean {
  // Placeholder logic: check if username and password are not empty
  if (username && password) {
    console.log('Login successful');
    return true;
  } else {
    console.log('Login failed');
    return false;
  }
}
