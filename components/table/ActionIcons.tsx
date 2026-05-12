import { Button } from "@/components/ui/Button";
import { Eye, MoreVertical, Pencil } from "lucide-react";

export function ActionIcons({
  onPlaceholder,
}: {
  onPlaceholder?: () => void;
}) {
  return (
    <div className="flex items-center justify-end gap-1">
      <Button aria-label="View" title="View" onClick={onPlaceholder} size="sm" variant="ghost" className="h-7 px-2"><Eye size={14} /></Button>
      <Button aria-label="Edit" title="Edit" onClick={onPlaceholder} size="sm" variant="ghost" className="h-7 px-2"><Pencil size={14} /></Button>
      <Button aria-label="More actions" title="More actions" onClick={onPlaceholder} size="sm" variant="ghost" className="h-7 px-2"><MoreVertical size={14} /></Button>
    </div>
  );
}
