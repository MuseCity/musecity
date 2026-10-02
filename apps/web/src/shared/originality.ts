export type OriginalitySubject = {
  kind: "account" | "agent";
  id: string;
  name: string;
};
export type Originality = {
  requestedUrl: string;
  verifiedUrl: string;
  verifiedAt: string;
  subject: OriginalitySubject;
};
export const originalityReasons = {
  marker_missing:
    "No matching creator marker was found in the initial HTML head. Add your marker, deploy the website, and try again.",
  unsafe_url:
    "Verification requires a public HTTPS website on port 443, without credentials or an IP address.",
  cross_origin_redirect:
    "This link redirects to another website. Save its final HTTPS URL and try again.",
  redirect_limit:
    "This website redirects too many times. Save the final URL and try again.",
  unavailable:
    "Website verification is unavailable. You can still publish without the badge.",
  timeout:
    "The website did not respond within five seconds. You can retry verification.",
  fetch_failed:
    "The website could not be reached. Make sure it is publicly accessible and try again.",
  http_error:
    "The website did not return a successful public page. Check access requirements and try again.",
  not_html: "This URL did not return an HTML webpage.",
  too_large: "The webpage exceeds the 1 MiB verification limit.",
  rate_limited:
    "Your household has reached ten website checks this minute. Please retry in the next minute.",
} as const;
export type OriginalityReason = keyof typeof originalityReasons;
export type OriginalityCheck = {
  status: "verified" | "failed";
  reason: OriginalityReason | null;
  checkedAt: string;
};
export const websiteMarkerHtml = (marker: string) =>
  `<meta name="musecity-creator" content="${marker}">`;
