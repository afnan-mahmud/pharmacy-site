import { listRetailCustomers } from "@/actions/retailCustomers";
import {
  RetailCustomerTable,
  type RetailCustomerRow,
} from "@/components/RetailCustomerTable";

export default async function RetailCustomersPage() {
  const customers = await listRetailCustomers();

  const rows: RetailCustomerRow[] = customers.map((c) => ({
    id: c._id,
    name: c.name,
    phone: c.phone,
  }));

  return <RetailCustomerTable customers={rows} />;
}
