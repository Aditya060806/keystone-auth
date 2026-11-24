type State = { jar: Map<string, string>; headers: Headers };
const state = () => (globalThis as unknown as { __req: State }).__req;

export type Device = State;

/** Starts acting as a brand-new device with an empty cookie jar. */
export function newDevice(userAgent: string): Device {
  const d: Device = { jar: new Map(), headers: new Headers({ "user-agent": userAgent }) };
  switchToDevice(d);
  return d;
}

export function switchToDevice(d: Device) {
  state().jar = d.jar;
  state().headers = d.headers;
}

export function currentJar() {
  return state().jar;
}

export const ORIGIN = "http://localhost:3000";

/** Builds a same-origin JSON request for calling route handlers directly. */
export function post(path: string, body?: unknown, method = "POST"): Request {
  return new Request(ORIGIN + path, {
    method,
    headers: { origin: ORIGIN, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
