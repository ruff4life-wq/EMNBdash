import OperationsDashboard from "@/components/dashboard/OperationsDashboard";

export const metadata = {
  title: "Restaurant Operations Intelligence",
};

/** Dashboard route: layout wrapper keeps the shell full-width; section order lives in OperationsDashboard. */
export default function DashboardPage() {
  return (
    <div className="min-w-0">
      <OperationsDashboard initialTab="dashboard" />
    </div>
  );
}
