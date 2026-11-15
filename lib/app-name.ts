/**
 * The name users see. The codebase is "slate"; a deployment may present a
 * different name. Internal identifiers such
 * as cookie and storage keys stay on the codename so a rename never signs
 * anyone out.
 */
export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? "Slate";
