import OperationsDashboard from "@/components/dashboard/OperationsDashboard";

export const metadata = {
  title: "Menu Management | Restaurant Operations Intelligence",
};

export default function MenuPage() {
  return <OperationsDashboard initialTab="menu" />;
}
