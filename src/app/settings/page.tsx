import OperationsDashboard from "@/components/dashboard/OperationsDashboard";

export const metadata = {
  title: "Settings | Restaurant Operations Intelligence",
};

export default function SettingsPage() {
  return <OperationsDashboard initialTab="settings" />;
}
