import type { Metadata } from "next";
import ExpensesList from "@/components/expenses/ExpensesList";

export const metadata: Metadata = { title: "Expenses | Awan Electronics" };

export default function ExpensesPage() {
  return <ExpensesList />;
}
