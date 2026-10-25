/** The API's refusal when no session is marked current. */
export function isNoAcademicSessionError(message: string | undefined): boolean {
  return message !== undefined && /no academic session/i.test(message);
}
