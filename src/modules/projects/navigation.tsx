import { AnimatedSettingsIcon } from "@/components/icons/animated-settings-icon";
import { LayoutGrid, FolderKanban, ListTodo, Flag, BarChart3 } from "lucide-react";
import type { ModuleNavItem } from "@/types/module";

export const projectsNavigation: ModuleNavItem[] = [
  { label: "Projects Overview", href: "/app/projects", icon: <LayoutGrid className="size-4" />, description: "See at a glance how many projects are active, how many tasks are open or overdue, and jump into projects, tasks, or milestones." },
  { label: "Projects", href: "/app/projects/projects", icon: <FolderKanban className="size-4" />, description: "Create projects with a budget, dates, and owner, and track or change their status through planning, active, on hold, or completed." },
  { label: "Tasks", href: "/app/projects/tasks", icon: <ListTodo className="size-4" />, description: "Create tasks under a project or milestone, assign them to a teammate, set priority, and move them through to do, in progress, in review, and done." },
  { label: "Milestones", href: "/app/projects/milestones", icon: <Flag className="size-4" />, description: "Add milestones to a project with a due date and mark them complete once every task under them is done." },
  { label: "Reports", href: "/app/projects/reports", icon: <BarChart3 className="size-4" />, description: "Review project and task counts by status plus each teammate's open task workload, and export the report." },
  { label: "Projects Settings", href: "/app/projects/settings", icon: <AnimatedSettingsIcon size={16} />, description: "Set the prefix used to number new project codes, such as turning PRJ into PRJ-0001." },
];
