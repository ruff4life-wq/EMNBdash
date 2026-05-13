import OperationsDashboard from "@/components/dashboard/OperationsDashboard";

export const metadata = {
  title: "Restaurant Operations Intelligence",
};

export default function DashboardPage() {
  return <OperationsDashboard initialTab="dashboard" />;
}
