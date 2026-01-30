import * as React from "react";
import { cn } from "@/lib/utils";

interface SelectProps {
    value?: string;
    onValueChange?: (value: string) => void;
    children: React.ReactNode;
}

const SelectContext = React.createContext<{
    value?: string;
    onValueChange?: (value: string) => void;
    open: boolean;
    setOpen: (open: boolean) => void;
}>({
    open: false,
    setOpen: () => { },
});

const Select = ({ value, onValueChange, children }: SelectProps) => {
    const [open, setOpen] = React.useState(false);

    return (
        <SelectContext.Provider value={{ value, onValueChange, open, setOpen }}>
            <div className="relative">{children}</div>
        </SelectContext.Provider>
    );
};

const SelectTrigger = React.forwardRef<
    HTMLButtonElement,
    React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, children, ...props }, ref) => {
    const { open, setOpen } = React.useContext(SelectContext);

    return (
        <button
            ref={ref}
            type="button"
            className={cn(
                "flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1",
                className
            )}
            onClick={() => setOpen(!open)}
            {...props}
        >
            {children}
            <svg
                className="h-4 w-4 opacity-50"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
            >
                <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                />
            </svg>
        </button>
    );
});
SelectTrigger.displayName = "SelectTrigger";

const SelectValue = ({ placeholder }: { placeholder?: string }) => {
    const { value } = React.useContext(SelectContext);
    return <span>{value || placeholder}</span>;
};

const SelectContent = ({
    children,
    className,
}: {
    children: React.ReactNode;
    className?: string;
}) => {
    const { open, setOpen } = React.useContext(SelectContext);

    if (!open) return null;

    return (
        <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div
                className={cn(
                    "absolute z-50 mt-1 max-h-60 min-w-[8rem] overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md",
                    className
                )}
            >
                {children}
            </div>
        </>
    );
};

const SelectItem = ({
    value,
    children,
    className,
}: {
    value: string;
    children: React.ReactNode;
    className?: string;
}) => {
    const { onValueChange, setOpen, value: selectedValue } = React.useContext(SelectContext);

    return (
        <div
            className={cn(
                "relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 pl-2 pr-8 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                selectedValue === value && "bg-accent",
                className
            )}
            onClick={() => {
                onValueChange?.(value);
                setOpen(false);
            }}
        >
            {children}
        </div>
    );
};

export { Select, SelectTrigger, SelectValue, SelectContent, SelectItem };
