export interface Branch {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
  is_active: boolean;
  created_at: string;
}

export interface Category {
  id: string;
  branch_id: string | null;
  name: string;
  display_order: number;
}

export interface MenuItem {
  id: string;
  branch_id: string | null;
  category_id: string | null;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  is_available: boolean;
  is_veg: boolean;
  is_deliverable: boolean;
  created_at: string;
  categories?: Pick<Category, 'name' | 'display_order'> | null;
}

export interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  image_url?: string | null;
  is_veg?: boolean;
}

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'out_for_delivery'
  | 'served'
  | 'cancelled';

export type PaymentStatus = 'unpaid' | 'paid' | 'cash';

export type FulfillmentType = 'dine_in' | 'pickup' | 'delivery';

export type StaffRole = 'staff' | 'manager' | 'admin';

export interface Staff {
  id: string;
  user_id: string | null;
  branch_id: string | null;
  name: string | null;
  role: StaffRole;
}

export interface RestaurantTable {
  id: string;
  branch_id: string | null;
  table_number: string;
  qr_token: string;
  is_occupied: boolean;
}

export interface OrderItemRow {
  id: string;
  order_id: string;
  menu_item_id: string | null;
  item_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

export interface OrderRow {
  id: string;
  branch_id: string | null;
  table_id: string | null;
  table_number: string | null;
  table_token?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_session_id?: string | null;
  status: OrderStatus;
  payment_status: PaymentStatus;
  payment_method: string | null;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  subtotal: number | null;
  total: number | null;
  customer_note: string | null;
  is_manual: boolean;
  fulfillment_type: FulfillmentType;
  delivery_address: string | null;
  delivery_landmark: string | null;
  delivery_pincode: string | null;
  delivery_lat: number | null;
  delivery_lng: number | null;
  rider_token: string | null;
  rider_lat: number | null;
  rider_lng: number | null;
  rider_updated_at: string | null;
  created_at: string;
}

export interface OrderWithItems extends OrderRow {
  order_items: OrderItemRow[];
}

export interface Review {
  id: string;
  order_id: string | null;
  branch_id: string | null;
  customer_session_id: string | null;
  customer_name: string | null;
  rating: number;
  body: string | null;
  is_published: boolean;
  is_featured: boolean;
  created_at: string;
}

export type ReservationStatus =
  | 'pending'
  | 'confirmed'
  | 'seated'
  | 'completed'
  | 'cancelled'
  | 'no_show';

export interface Reservation {
  id: string;
  branch_id: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  party_size: number;
  reserved_at: string;
  duration_minutes: number | null;
  occasion: string | null;
  note: string | null;
  status: ReservationStatus;
  handled_by: string | null;
  confirmation_code: string | null;
  created_at: string;
  updated_at: string;
  branches?: { name: string; city: string | null } | null;
}

export type BlogSource = 'native' | 'vanlavino_wp';

export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  body_html: string | null;
  body_md: string | null;
  hero_image_url: string | null;
  hero_image_external_url: string | null;
  published_at: string | null;
  source: BlogSource;
  source_url: string | null;
  source_checksum: string | null;
  is_published: boolean;
  is_featured: boolean;
  created_at: string;
  updated_at: string;
}
