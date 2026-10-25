/** “Or” rule between primary action and secondary auth link (signup / login). */
export function AuthOrDivider() {
  return (
    <div className="relative py-0.5">
      <div className="absolute inset-0 flex items-center" aria-hidden="true">
        <div className="w-full border-t border-border" />
      </div>
      <div className="relative flex justify-center">
        <span className="bg-background px-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Or
        </span>
      </div>
    </div>
  );
}
