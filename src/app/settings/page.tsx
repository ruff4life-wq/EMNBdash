import OperationsDashboard from "@/components/dashboard/OperationsDashboard";

export const metadata = {
  title: "Settings | Restaurant Operations Intelligence",
};

export default function SettingsPage() {
  return (
    <div className="min-w-0">
      <OperationsDashboard initialTab="settings" dedicatedSettingsRoute />
    </div>
  );
}
