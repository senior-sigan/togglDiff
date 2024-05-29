export function basicAuth(user: string, password: string) {
  return "Basic " + btoa(user + ":" + password);
}
