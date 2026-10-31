/** Candidate builds are isolated demonstrations, even if credentials are injected by mistake. */
export const isCandidateRelease =
  import.meta.env.VITE_RELEASE_CHANNEL === "candidate";
