// Položka navigace, kterou layout předává klientskému shellu.
export interface NavItem {
  href: string;
  label: string;
  /** Název ikony z lucide-react (mapováno v shellu). */
  icon: string;
}

export interface NavUser {
  jmeno: string;
  email: string;
  roleName: string;
}

/** Sekce navigace s volitelným nadpisem skupiny (Obchod / Marketing). */
export interface NavGroup {
  /** Nadpis sekce; `null` = bez nadpisu (např. „Přehled", „Administrace"). */
  label: string | null;
  items: NavItem[];
}
