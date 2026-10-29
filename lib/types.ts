export type ComplaintStatus = "pending" | "in_progress" | "resolved";
export type InvoiceStatus = "paid" | "partial" | "pending";

export interface Complaint {
  id: string;
  complaint_no: string;
  client_name: string;
  led_model: string;
  serial_number: string;
  phone: string;
  address: string;
  technician: string | null;
  technician_phone?: string | null;
  defect: string | null;
  /** Accessories received with the product, e.g. remote, stand, power cable. */
  accessories?: string | null;
  /** Condition of the product when it was brought in, e.g. "Screen scratched". */
  condition?: string | null;
  notes: string | null;
  /** Money the customer paid in advance when the complaint was registered. */
  advance_amount?: number | null;
  status: ComplaintStatus;
  complaint_date: string;
  created_at: string;
  /** Result of the "complaint registered" SMS to the client. */
  sms_status?: SmsStatus | null;
  sms_error?: string | null;
  sms_sent_at?: string | null;
}

export type SmsStatus = "sent" | "failed" | "not_configured";

export type ComplaintInput = Omit<Complaint, "id" | "created_at" | "sms_status" | "sms_error" | "sms_sent_at">;

export interface Invoice {
  id: string;
  invoice_no: string;
  complaint_id: string | null;
  purchase_id: string | null;
  description: string;
  amount: number;
  /** Amount already received against this invoice. */
  paid_amount?: number | null;
  status: InvoiceStatus;
  invoice_date: string;
  /** Optional note printed on the invoice. */
  notes?: string | null;
  /** Warranty on the repair, e.g. 3 + "months". Both null = no warranty. */
  warranty_value?: number | null;
  warranty_unit?: WarrantyUnit | null;
  created_at: string;
}

export interface InvoiceWithComplaint extends Invoice {
  complaint: (Pick<Complaint, "complaint_no" | "client_name" | "phone" | "address" | "led_model" | "advance_amount"> &
    Partial<Pick<Complaint, "complaint_date" | "serial_number" | "technician" | "technician_phone" | "defect" | "condition" | "notes">> & {
    /** Payments made after registering the complaint. */
    payments?: { amount: number }[];
  }) | null;
  purchase: Pick<ShopPurchase, "customer_name" | "phone" | "address" | "product" | "purchase_date"> | null;
}

export interface ShopPurchase {
  id: string;
  customer_name: string;
  phone: string;
  address: string;
  product: string;
  amount: number;
  purchase_date: string;
  created_at: string;
  /** Warranty, e.g. 6 + "months". Both null = no warranty. */
  warranty_value?: number | null;
  warranty_unit?: WarrantyUnit | null;
}

export type WarrantyUnit = "days" | "months" | "years";

export interface InventoryItem {
  id: string;
  name: string;
  category: string | null;
  sku: string | null;
  quantity: number;
  cost_price: number;
  min_stock: number;
  created_at: string;
}

export interface Technician {
  id: string;
  name: string;
  phone: string | null;
  created_at: string;
}

export type TechnicianPurchasePaymentStatus = "paid" | "partial" | "pending";

export interface TechnicianPurchase {
  id: string;
  technician_id: string;
  item_id: string | null;
  item_name: string;
  quantity: number;
  returned_quantity: number;
  unit_price: number;
  payment_status: TechnicianPurchasePaymentStatus;
  /** Money paid so far when payment_status is "partial". */
  paid_amount: number;
  /** Computed by the database: (quantity - returned_quantity) * unit_price */
  total_amount: number;
  purchase_date: string;
  returned_date: string | null;
  notes: string | null;
  created_at: string;
}

export interface TechnicianPayment {
  id: string;
  technician_id: string;
  amount: number;
  payment_date: string;
  notes: string | null;
  created_at: string;
}

export interface CustomerPayment {
  id: string;
  complaint_id: string;
  amount: number;
  payment_date: string;
  notes: string | null;
  created_at: string;
}

export type ExpensePaymentStatus = "paid" | "pending";

export interface Expense {
  id: string;
  expense_type: string;
  amount: number;
  expense_date: string;
  notes: string | null;
  payment_status?: ExpensePaymentStatus;
  created_at: string;
}

export interface VendorPayment {
  id: string;
  vendor_name: string;
  payment_date: string;
  amount_paid: number;
  amount_pending: number;
  notes: string | null;
  created_at: string;
}

export interface Settings {
  id: number;
  business_name: string;
  admin_name: string;
  logo_url: string | null;
  avatar_url: string | null;
}
