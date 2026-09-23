import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { Button, IconButton } from "./controls";
import { joinClasses } from "./utils";

export type OverlaySize = "sm" | "md" | "lg";
export type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string | undefined;
  children: ReactNode;
  className?: string | undefined;
  hideHeader?: boolean;
  size?: OverlaySize;
};

const FormDirtyContext = createContext<(dirty: boolean) => void>(
  () => undefined,
);

export function useFormDirty(dirty: boolean) {
  const report = useContext(FormDirtyContext);
  useEffect(() => {
    report(dirty);
    return () => report(false);
  }, [dirty, report]);
}

function Overlay({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
  hideHeader = false,
  size = "md",
  sheet = false,
}: DialogProps & { sheet?: boolean }) {
  const [dirty, setDirty] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const opener = useRef<HTMLElement | null>(null);
  const previousOpen = useRef(open);
  if (open && !previousOpen.current) {
    opener.current = document.activeElement as HTMLElement | null;
  }
  previousOpen.current = open;

  const changeOpen = (next: boolean) => {
    if (!next && dirty) setConfirming(true);
    else onOpenChange(next);
  };

  return (
    <FormDirtyContext.Provider value={setDirty}>
      <DialogPrimitive.Root open={open} onOpenChange={changeOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="dialog-overlay ds-dialog__overlay" />
          <DialogPrimitive.Content
            className={joinClasses(
              "dialog-content",
              "ds-dialog",
              `ds-dialog--${size}`,
              sheet && "sheet-content ds-sheet",
              className,
            )}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              opener.current?.focus();
            }}
            onEscapeKeyDown={(event) => {
              if (
                (event.target as Element | null)?.getAttribute("role") ===
                "combobox"
              ) {
                event.preventDefault();
              }
            }}
          >
            <header
              className={
                hideHeader ? "sr-only" : "dialog-header ds-dialog__header"
              }
            >
              <div>
                <DialogPrimitive.Title>{title}</DialogPrimitive.Title>
                {description && (
                  <DialogPrimitive.Description>
                    {description}
                  </DialogPrimitive.Description>
                )}
              </div>
              {!hideHeader && (
                <DialogPrimitive.Close asChild>
                  <IconButton aria-label="Fechar">
                    <X size={18} />
                  </IconButton>
                </DialogPrimitive.Close>
              )}
            </header>
            <div className="dialog-body ds-dialog__body">{children}</div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
      <DialogPrimitive.Root open={confirming} onOpenChange={setConfirming}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="dialog-overlay dialog-overlay-confirm ds-dialog__overlay" />
          <DialogPrimitive.Content className="dialog-content confirm-content ds-dialog ds-dialog--sm">
            <DialogPrimitive.Title>Descartar alterações?</DialogPrimitive.Title>
            <DialogPrimitive.Description>
              As informações preenchidas serão perdidas.
            </DialogPrimitive.Description>
            <div className="form-actions dialog-actions ds-dialog__footer">
              <Button variant="secondary" onClick={() => setConfirming(false)}>
                Continuar editando
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  setConfirming(false);
                  setDirty(false);
                  onOpenChange(false);
                }}
              >
                Descartar
              </Button>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </FormDirtyContext.Provider>
  );
}

export function Dialog(props: DialogProps) {
  return <Overlay {...props} />;
}

export function Sheet(props: DialogProps) {
  return <Overlay {...props} sheet />;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirmar",
  onConfirm,
}: Omit<DialogProps, "children"> & {
  confirmLabel?: string;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      size="sm"
    >
      <div className="form-actions dialog-actions ds-dialog__footer">
        <Button variant="secondary" onClick={() => onOpenChange(false)}>
          Continuar editando
        </Button>
        <Button variant="danger" onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}

/** @deprecated Use Dialog. */
export const FormDialog = Dialog;
/** @deprecated Use Sheet. */
export const FormSheet = Sheet;
