import { LayoutGrid, FolderKanban, ListTodo, Flag, BarChart3, Settings } from "lucide-react";
import type { ModuleNavItem } from "@/types/module";

export const projectsNavigation: ModuleNavItem[] = [
  { label: "Projects Overview", href: "/app/projects", icon: <LayoutGrid className="size-4" /> },
  { label: "Projects", href: "/app/projects/projects", icon: <FolderKanban className="size-4" /> },
  { label: "Tasks", href: "/app/projects/tasks", icon: <ListTodo className="size-4" /> },
  { label: "Milestones", href: "/app/projects/milestones", icon: <Flag className="size-4" /> },
  { label: "Reports", href: "/app/projects/reports", icon: <BarChart3 className="size-4" /> },
  { label: "Projects Settings", href: "/app/projects/settings", icon: <Settings className="size-4" /> },
];
