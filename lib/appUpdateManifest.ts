export type AppUpdateSection = {
  title: string;
  items: string[];
};

export type AppUpdateManifest = {
  version: string;
  versionLabel: string;
  title: string;
  summary: string;
  publishedAt: string;
  sections: AppUpdateSection[];
};

const getDeploymentVersion = () =>
  process.env.VERCEL_DEPLOYMENT_ID
  || process.env.VERCEL_GIT_COMMIT_SHA
  || process.env.NEXT_PUBLIC_APP_UPDATE_VERSION
  || "dev";

const toVersionLabel = (version: string) => {
  if (!version || version === "dev") return "Development build";
  return version.length > 10 ? version.slice(0, 10) : version;
};

export function getCurrentAppUpdateManifest(): AppUpdateManifest {
  const version = getDeploymentVersion();

  return {
    version,
    versionLabel: toVersionLabel(version),
    title: "TradeFlow has a new update ready",
    summary: "A newer version of the app is available. Update now to load the latest fixes and improvements.",
    publishedAt: "2026-06-23",
    sections: [
      {
        title: "Highlights",
        items: [
          "Payment-agent finance flow is more consistent across orders and ledger views.",
          "Order editing and selection controls were cleaned up for faster daily use.",
        ],
      },
      {
        title: "Fixes",
        items: [
          "Resolved category-switch flicker in Orders.",
          "Improved payment-agent and WeChat suggestion dropdown behavior.",
          "Fixed display formatting issues in order preview values.",
        ],
      },
      {
        title: "Recommended action",
        items: [
          "Use Update Now to reload the app and start using the latest deployment immediately.",
        ],
      },
    ],
  };
}
