// In-memory hand-off between the scan screen and the analyzing screen.
// Files cannot be serialized to sessionStorage, so we keep them here; a page
// refresh mid-flow simply sends the user back to the scan step.

export type PendingInput =
  | { kind: "video"; file: File }
  | { kind: "photos"; files: File[] }
  | { kind: "sample-photos"; slug: string; urls: string[] }
  | { kind: "sample-video"; slug: string; url: string };

let pending: PendingInput | null = null;

export function setPendingInput(input: PendingInput | null) {
  pending = input;
}
export function takePendingInput(): PendingInput | null {
  const p = pending;
  pending = null;
  return p;
}
export function peekPendingInput(): PendingInput | null {
  return pending;
}
