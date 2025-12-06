export type CoinEntry = {
  id: string;
  title: string;
  subtitle: string;
  avatar?: string;
  timeAgo: string;
  mc: string;
  volume: string;
  fee: string;
  owner: string;
  stats: Array<{ label: string; value: string }>;
  tags?: string[];
  statusColor?: string;
};

export const trenchesBoard = {
  new: [
    {
      id: "link",
      title: "Link?",
      subtitle: "Viral mms",
      avatar: "https://i.pravatar.cc/64?img=68",
      timeAgo: "3m",
      mc: "$9.5K",
      volume: "$3.0K",
      fee: "0.081",
      owner: "@mumbaichadon",
      stats: [
        { label: "%", value: "+7%" },
        { label: "24h", value: "+7%" },
        { label: "4d", value: "+1" },
        { label: "Hold", value: "7%" },
      ],
    },
    {
      id: "eve",
      title: "Eve-chu",
      subtitle: "Evangelion Pikachu",
      avatar: "https://i.pravatar.cc/64?img=49",
      timeAgo: "5m",
      mc: "$22K",
      volume: "$5.9K",
      fee: "0.118",
      owner: "@yugiohcardgam",
      stats: [
        { label: "%", value: "+2%" },
        { label: "3mo", value: "+0" },
        { label: "Holders", value: "0" },
        { label: "DS", value: "0%" },
      ],
    },
    {
      id: "trumpigg",
      title: "trumpigg",
      subtitle: "trumpigg",
      avatar: "https://i.pravatar.cc/64?img=13",
      timeAgo: "25m",
      mc: "$950",
      volume: "$3.9K",
      fee: "0.076",
      owner: "@youranoncentral",
      stats: [
        { label: "Votes", value: "131" },
        { label: "DS", value: "1%" },
        { label: "Growth", value: "+0" },
        { label: "O", value: "0%" },
      ],
    },
  ],
  soon: [
    {
      id: "minara",
      title: "MINARA",
      subtitle: "MINARA AI",
      timeAgo: "9m",
      mc: "$510",
      volume: "$0",
      fee: "0",
      owner: "49n...soar",
      stats: [
        { label: "Signal", value: "95%" },
        { label: "DS", value: "0%" },
        { label: "MC", value: "0%" },
        { label: "Watch", value: "7" },
      ],
    },
    {
      id: "sprint",
      title: "SPRINT",
      subtitle: "SPRINT IQ",
      timeAgo: "50m",
      mc: "$100K",
      volume: "$0",
      fee: "0",
      owner: "4c9...soar",
      stats: [
        { label: "Signal", value: "95%" },
        { label: "DS", value: "1mo" },
        { label: "MC", value: "0%" },
        { label: "Watch", value: "7" },
      ],
    },
    {
      id: "github",
      title: "GITHUB",
      subtitle: "GitHub",
      timeAgo: "5h",
      mc: "$100K",
      volume: "$0",
      fee: "0",
      owner: "5Fn...soar",
      stats: [
        { label: "Signal", value: "95%" },
        { label: "DS", value: "0%" },
        { label: "MC", value: "0%" },
        { label: "Watch", value: "7" },
      ],
    },
  ],
  migrated: [
    {
      id: "pikajew",
      title: "pikajew",
      subtitle: "pikajew",
      avatar: "https://i.pravatar.cc/64?img=12",
      timeAgo: "22s",
      mc: "$959K",
      volume: "$22K",
      fee: "0.010",
      owner: "GnZ...XU5L",
      stats: [
        { label: "Signal", value: "97%" },
        { label: "3m", value: "0%" },
        { label: "2h", value: "+20%" },
        { label: "Alerts", value: "20%" },
      ],
    },
    {
      id: "opsea",
      title: "Opsea",
      subtitle: "Opensea.io",
      avatar: "https://i.pravatar.cc/64?img=5",
      timeAgo: "27s",
      mc: "$1.3M",
      volume: "$26K",
      fee: "0.010",
      owner: "Bhp...gKDe",
      stats: [
        { label: "Signal", value: "98%" },
        { label: "0%", value: "14m" },
        { label: "1h", value: "+20%" },
        { label: "Alerts", value: "20%" },
      ],
    },
    {
      id: "tsla",
      title: "TSLA",
      subtitle: "Tesla Coin",
      avatar: "https://i.pravatar.cc/64?img=33",
      timeAgo: "2m",
      mc: "$161K",
      volume: "$7.0K",
      fee: "0.010",
      owner: "@grok",
      stats: [
        { label: "Signal", value: "100%" },
        { label: "16%", value: "7m" },
        { label: "2p", value: "2" },
        { label: "Alerts", value: "16%" },
      ],
    },
  ],
};
