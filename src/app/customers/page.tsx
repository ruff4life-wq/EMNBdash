import OperationsDashboard from "@/components/dashboard/OperationsDashboard";

export const metadata = {
  title: "Customers | Restaurant Operations Intelligence",
};

export default function CustomersPage() {
  return (
    <div className="min-w-0">
      <OperationsDashboard initialTab="customers" />
    </div>
  );
}
