import { useRef } from 'react';
import { Button, IconButton } from '@/design';
import {
  BoldIcon,
  CodeIcon,
  CopyIcon,
  ExternalLinkIcon,
  ItalicIcon,
  LinkIcon,
  TrashIcon,
} from './icons';

export type ContextualToolbarContext =
  | 'none'
  | 'selection'
  | 'link-creation'
  | 'existing-link';
export type InlineFormat = 'bold' | 'italic' | 'code';

export interface ContextualToolbarProps {
  context: ContextualToolbarContext;
  activeFormats?: ReadonlySet<InlineFormat>;
  disabledFormats?: ReadonlySet<InlineFormat>;
  linkValue?: string;
  onFormat?: (format: InlineFormat) => void;
  onStartLink?: () => void;
  onLinkValueChange?: (value: string) => void;
  onApplyLink?: () => void;
  onCancelLink?: () => void;
  onOpenLink?: () => void;
  onCopyLink?: () => void;
  onRemoveLink?: () => void;
  linkActionDisabled?: boolean;
}

export function ContextualToolbar({
  context,
  activeFormats = new Set(),
  disabledFormats = new Set(),
  linkValue = '',
  onFormat,
  onStartLink,
  onLinkValueChange,
  onApplyLink,
  onCancelLink,
  onOpenLink,
  onCopyLink,
  onRemoveLink,
  linkActionDisabled = false,
}: ContextualToolbarProps) {
  const toolbarRef = useRef<HTMLDivElement>(null);

  if (context === 'none') return null;

  function moveFocus(event: React.KeyboardEvent<HTMLDivElement>): void {
    if (event.target instanceof HTMLInputElement) return;
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;

    const controls = [...(toolbarRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled)') ?? [])];
    if (controls.length === 0) return;

    event.preventDefault();
    const current = Math.max(0, controls.indexOf(document.activeElement as HTMLElement));
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? controls.length - 1
          : (current + (event.key === 'ArrowRight' ? 1 : -1) + controls.length) % controls.length;
    controls[next]?.focus();
  }

  const formatControls = context === 'selection' && (
    <>
      <IconButton
        label="Bold"
        icon={<BoldIcon />}
        selected={activeFormats.has('bold')}
        disabled={disabledFormats.has('bold')}
        onClick={() => onFormat?.('bold')}
      />
      <IconButton
        label="Italic"
        icon={<ItalicIcon />}
        selected={activeFormats.has('italic')}
        disabled={disabledFormats.has('italic')}
        onClick={() => onFormat?.('italic')}
      />
      <IconButton
        label="Inline code"
        icon={<CodeIcon />}
        selected={activeFormats.has('code')}
        disabled={disabledFormats.has('code')}
        onClick={() => onFormat?.('code')}
      />
      <span className="lmd-desktop-toolbar-separator" aria-hidden="true" />
      <IconButton
        label="Create link"
        icon={<LinkIcon />}
        disabled={linkActionDisabled}
        onClick={onStartLink}
      />
    </>
  );

  const linkEditor = context === 'link-creation' && (
    <>
      <LinkIcon />
      <input
        className="lmd-desktop-toolbar-link-input"
        value={linkValue}
        onChange={(event) => onLinkValueChange?.(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !linkActionDisabled) onApplyLink?.();
          if (event.key === 'Escape') onCancelLink?.();
        }}
        aria-label="Link address"
        placeholder="https://"
        autoFocus
        spellCheck={false}
      />
      <Button variant="bordered" disabled={linkActionDisabled} onClick={onApplyLink}>
        Add link
      </Button>
      <Button onClick={onCancelLink}>Cancel</Button>
    </>
  );

  const existingLink = context === 'existing-link' && (
    <>
      <LinkIcon />
      <span className="lmd-desktop-toolbar-url" title={linkValue}>
        {linkValue}
      </span>
      <span className="lmd-desktop-toolbar-separator" aria-hidden="true" />
      <IconButton
        label="Open link"
        icon={<ExternalLinkIcon />}
        disabled={linkActionDisabled}
        onClick={onOpenLink}
      />
      <IconButton
        label="Copy link"
        icon={<CopyIcon />}
        disabled={linkActionDisabled}
        onClick={onCopyLink}
      />
      <IconButton
        label="Remove link"
        icon={<TrashIcon />}
        disabled={linkActionDisabled}
        onClick={onRemoveLink}
      />
    </>
  );

  return (
    <div
      ref={toolbarRef}
      className="lmd-desktop-contextual-toolbar"
      role="toolbar"
      aria-label="Text formatting"
      data-context={context}
      onKeyDown={moveFocus}
    >
      {formatControls}
      {linkEditor}
      {existingLink}
    </div>
  );
}
