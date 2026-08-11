import type { Page, Request } from '@playwright/test';

/**
 * Cross-origin request recorder.
 *
 * This is the enforcement mechanism behind LocalMD's privacy claim. The CSP's
 * `connect-src 'none'` structurally blocks programmatic egress, but remote
 * *subresources* (images, media) are blocked in application code so the
 * opt-in feature can exist — which means a bug in the image gate could still
 * reach the network. Only this recorder catches that.
 *
 * Attach before navigating: requests fired during load are the ones that matter.
 */
export function recordCrossOriginRequests(page: Page, appOrigin: string) {
  const attempts: { url: string; method: string; resourceType: string; blocked: boolean }[] = [];

  const isCrossOrigin = (url: string) => {
    // data:/blob: never touch the network; they are local by construction.
    if (url.startsWith('data:') || url.startsWith('blob:')) return false;
    try {
      return new URL(url).origin !== appOrigin;
    } catch {
      return false;
    }
  };

  const note = (request: Request, blocked: boolean) => {
    const url = request.url();
    if (!isCrossOrigin(url)) return;
    attempts.push({ url, method: request.method(), resourceType: request.resourceType(), blocked });
  };

  page.on('request', (request) => note(request, false));
  // A request blocked by CSP still counts: the browser was asked to make it.
  page.on('requestfailed', (request) => note(request, true));

  return {
    /** Every cross-origin request the page attempted, blocked or not. */
    get attempts() {
      return attempts;
    },
    /** Formatted for assertion messages so failures name the offending URLs. */
    summary() {
      return attempts.map((a) => `${a.method} ${a.resourceType} ${a.url}`).sort();
    },
  };
}
