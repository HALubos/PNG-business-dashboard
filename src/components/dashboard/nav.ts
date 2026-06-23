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
