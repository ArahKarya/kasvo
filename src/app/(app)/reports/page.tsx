import { ComingSoon } from "@/components/coming-soon";

export default function Page() {
  return <ComingSoon title={(t) => t.nav.reports} milestone="M4" />;
}
