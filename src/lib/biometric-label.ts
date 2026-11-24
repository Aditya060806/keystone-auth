/** What the user will actually see the OS prompt for, so the button says it. */
export function biometricLabel(): string {
  if (typeof navigator === "undefined") return "Face ID or fingerprint";
  const ua = navigator.userAgent;
  if (/iPhone|iPad/.test(ua)) return "Face ID or Touch ID";
  if (/Macintosh/.test(ua)) return navigator.maxTouchPoints > 1 ? "Face ID or Touch ID" : "Touch ID";
  // Android only allows "strong" biometrics for passkeys; most phones' camera
  // face unlock doesn't qualify, so the prompt is fingerprint or screen lock.
  if (/Android/.test(ua)) return "fingerprint or screen lock";
  if (/Windows/.test(ua)) return "Windows Hello";
  return "a passkey";
}
