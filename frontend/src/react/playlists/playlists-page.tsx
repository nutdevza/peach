/* Playlists page: saved Mixes and hand-built lists, sorted by last change.
 *
 * A playlist is a stack of videos, the same thing as the home Mix card, so it wears the same clothes
 * (`components/mix-card.tsx`): the cover flips through the list's images one by one on hover, below it a row of the members
 * who appear most, and the title is the list's name. Rename and delete fold into the kebab menu right of the name: they are
 * this card's secondary actions and should not share a whole row with "Open".
 *
 * Create, rename and delete all write the ledger, triggered only by clicks; delete passes a confirmation dialog first. All
 * three surface an undo key on success, then have the list key refetch without remounting the page. When the shell asks this
 * page for a reread it bumps `revision`, and the page likewise only refetches. */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Heading, Popover } from 'react-aria-components';
import { MenuDialog as Dialog } from '../components/menu-dialog';
import { confirmModal } from '@peach/legacy/ui';

import { Button } from '@/components/base/buttons/button';
import {
  MENU_ITEM, MENU_ITEM_INTERACTIVE, MENU_POPOVER_SURFACE,
} from '@/components/base/dropdown/menu-styles';
import { Input } from '@/components/base/input/input';
import { cx } from '@/utils/cx';

import { errorMessage } from '../../api';
import type { PlaylistsProps } from '../bundle';
import { EmptyState, EmptyFocusButton } from '../components/empty-state';
import { RetryNote } from '../components/grid-reveal';
import { MixCard } from '../components/mix-card';
import { ModalFrame } from '../components/modal-frame';
import { ObjectOrderDialog } from '../components/object-order-dialog';
import { spriteGlyph } from '../components/sprite-glyph';
import { busyProps } from '../settings/use-action';
import {
  createPlaylist, deletePlaylist, fetchPlaylists, keepPlaylist, PLAYLISTS_KEY, posterUrl, recreatePlaylist,
  refreshPlaylists, renamePlaylist, resumeAssetId, fetchPlaylist, reorderPlaylist, type PlaylistRow,
} from './playlists';

const ELLIPSIS = spriteGlyph('ellipsis');
const PENCIL = spriteGlyph('pencil');
const TRASH = spriteGlyph('trash');
const PLAYLIST = spriteGlyph('playlist');

const MENU_ROW = cx(MENU_ITEM, MENU_ITEM_INTERACTIVE, 'text-body-2-medium');
const EMPTY_NAME = 'The playlist name cannot be empty';

type Toast = PlaylistsProps['toast'];

/** The undo step: after it runs the list is refetched regardless of outcome; a thrown error goes to the receipt, which rewords itself to "undo failed". */
const undoing = (task: () => Promise<unknown>) => async () => {
  try {
    await task();
  } finally {
    void refreshPlaylists();
  }
};

function CreateForm({ toast }: { toast: Toast }) {
  const [name, setName] = useState('');
  const [problem, setProblem] = useState('');
  const create = useMutation({
    mutationFn: (value: string) => createPlaylist(value),
    onSuccess: (result) => {
      setName('');
      setProblem('');
      void refreshPlaylists();
      toast('Playlist created', { undo: undoing(() => deletePlaylist(result.playlist.id)) });
    },
    onError: (cause) => setProblem(errorMessage(cause) || 'Creating failed'),
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (create.isPending) return;
    if (!name.trim()) { setProblem(EMPTY_NAME); return }
    create.mutate(name);
  };
  return (
    <form data-playlist-create="" aria-label="New playlist" onSubmit={submit}
      className="flex flex-wrap items-end gap-2">
      <div className="min-w-50 max-w-80 flex-1 basis-50 max-board-narrow:min-w-0 max-board-narrow:max-w-none">
        <Input label="New playlist" placeholder="Enter a name" maxLength={80} value={name}
          onChange={(value) => { setName(value); setProblem('') }}
          validationBehavior="aria" isInvalid={Boolean(problem)} hint={problem || undefined} />
      </div>
      <Button type="submit" {...busyProps(create.isPending)}>New</Button>
    </form>
  );
}

function RenameDialog({ target, close, toast }: { target: PlaylistRow | null; close(): void; toast: Toast }) {
  const [name, setName] = useState('');
  const [problem, setProblem] = useState('');
  const input = useRef<HTMLInputElement>(null);
  /* On open, select the whole original name: usually it gets replaced entirely, occasionally extended with a bit more. */
  useEffect(() => {
    if (!target) return undefined;
    setName(target.name);
    setProblem('');
    const frame = requestAnimationFrame(() => { input.current?.focus(); input.current?.select() });
    return () => cancelAnimationFrame(frame);
  }, [target]);
  const rename = useMutation({
    mutationFn: ({ row, value }: { row: PlaylistRow; value: string }) => renamePlaylist(row.id, value),
    onSuccess: (_result, { row }) => {
      close();
      void refreshPlaylists();
      toast('Renamed the playlist', { undo: undoing(() => renamePlaylist(row.id, row.name)) });
    },
    onError: (cause) => setProblem(errorMessage(cause)),
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!target || rename.isPending) return;
    const value = name.trim();
    if (!value) { setProblem(EMPTY_NAME); return }
    rename.mutate({ row: target, value });
  };
  return (
    <ModalFrame isOpen={Boolean(target)} onOpenChange={(open) => { if (!open) close() }} width="form">
      <form data-playlist-rename="" onSubmit={submit} className="flex min-h-0 flex-col">
        <div className="flex flex-col gap-4 p-5">
          <Heading slot="title" className="text-title-2-semibold text-text-primary">Edit name</Heading>
          <Input ref={input} label="Name" placeholder="Enter a name" maxLength={80} value={name}
            onChange={(value) => { setName(value); setProblem('') }}
            validationBehavior="aria" isInvalid={Boolean(problem)} hint={problem || undefined} />
        </div>
        <div className="flex justify-between gap-4 p-3">
          <Button variant="secondary" onClick={close}>Cancel</Button>
          <Button type="submit" {...busyProps(rename.isPending)}>Save name</Button>
        </div>
      </form>
    </ModalFrame>
  );
}

/** The kebab at the card's bottom right: edit name, delete playlist.
 *
 *  The trigger at rest is a transparent glyph, gaining a fill only on hover or expand, the same outfit as the crop-cover key
 *  (`../cover-crop/cover-crop-page.tsx`). BoardUI's icon buttons all carry a face at rest: `ghost` a pale blue block,
 *  `IconButton` a white bordered square, so every card would carry a block and the byline row would stop being just avatar
 *  and title. */
function PlaylistMenu({ name, onRename, onDelete, onSort }: { name: string; onRename(): void; onDelete(): void; onSort(): void }) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const run = (action: () => void) => { setOpen(false); action() };
  return (
    <>
      <button ref={trigger} type="button" title="More actions" aria-label={`Playlist actions: ${name}`}
        aria-haspopup="dialog" aria-expanded={open} data-playlist-menu="" onClick={() => setOpen(true)}
        className="flex size-7.5 flex-none cursor-pointer items-center justify-center rounded-2lg text-foreground-icon-secondary outline-none transition-colors hover:bg-background-primary-hover hover:text-foreground-icon-primary aria-expanded:bg-background-primary-hover aria-expanded:text-foreground-icon-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring">
        <ELLIPSIS aria-hidden className="size-4.5" />
      </button>
      <Popover triggerRef={trigger} isOpen={open} onOpenChange={setOpen}
        placement="bottom end" offset={4} className={MENU_POPOVER_SURFACE}>
        {/* The panel is 172px wide outside, same as the old card menu: the frame adds 10px padding and a 1px border. */}
        <Dialog aria-label={`Playlist actions: ${name}`} className="flex w-37.5 flex-col gap-0.5 outline-none">
          <button type="button" className={MENU_ROW} onClick={() => run(onRename)}>
            <PENCIL aria-hidden className="size-(--icon-inline) shrink-0" />Edit name
          </button>
          <button type="button" className={MENU_ROW} onClick={() => run(onSort)}>
            <PLAYLIST aria-hidden className="size-(--icon-inline) shrink-0" />Reorder playback          </button>
          <button type="button" className={MENU_ROW} onClick={() => run(onDelete)}>
            <TRASH aria-hidden className="size-(--icon-inline) shrink-0" />Delete playlist
          </button>
        </Dialog>
      </Popover>
    </>
  );
}

export function PlaylistsPage({ openPlaylist, openEntity, canFlip, toast, revision }: PlaylistsProps) {
  const playlists = useQuery({ queryKey: PLAYLISTS_KEY, queryFn: ({ signal }) => fetchPlaylists(signal) });
  const [renaming, setRenaming] = useState<PlaylistRow | null>(null);
  const [sorting, setSorting] = useState<PlaylistRow | null>(null);
  /* The shell requests a re-read: the first-frame generation was already fetched by `prefetch`, and each increment after that refetches once. */
  const seen = useRef(revision);
  useEffect(() => {
    if (seen.current === revision) return;
    seen.current = revision;
    void refreshPlaylists();
  }, [revision]);

  const data = playlists.data;
  const items = data?.items ?? [];

  const remove = (row: PlaylistRow) => {
    void confirmModal({
      title: 'Delete playlist', body: 'This playlist will be deleted; the video files are kept.', confirmLabel: 'Delete playlist', danger: true,
      onConfirm: async () => {
        const kept = await keepPlaylist(row.id);
        await deletePlaylist(row.id);
        void refreshPlaylists();
        toast('Playlist deleted', kept ? { undo: undoing(() => recreatePlaylist(kept)) } : undefined);
      },
    });
  };

  return (
    <div className="w-full pt-1 pb-10.5">
      <header className="mb-4 flex items-start justify-between gap-4.5 max-board-narrow:flex-col max-board-narrow:items-stretch">
        <div>
          {/* The legacy sheet's `.stats h2` is not in a layer and sets h2s to 24px (20px on narrow screens); utilities cannot beat it,
              so the type carries `!`; its 4px bottom margin equals this `mb-1`. */}
          <h2 className="mb-1 text-display-4-medium! text-text-primary">Playlists</h2>
          <p className="text-body-2-regular text-text-secondary">Save the Mix to keep playing in your own order.</p>
        </div>
        <CreateForm toast={toast} />
      </header>
      <div className="mx-auto w-full max-w-board">
      {/* On read failure the page header and the new-entry box stay as usual; the message and retry button land where the list would be. */}
      {!data
        ? (playlists.isError
          ? <RetryNote message={errorMessage(playlists.error) || 'Reading the playlist failed'} onRetry={() => void playlists.refetch()} />
          : null)
        : items.length
        ? (
          <div data-playlist-grid="" className="card-grid-cover gap-4.5">
            {items.map((row) => {
              const resume = resumeAssetId(row);
              const name = row.name.trim() || 'Untitled playlist';
              return (
                <MixCard key={row.id} data-playlist-card={String(row.id)} name={name}
                  caption={row.source_kind === 'mix' ? 'Saved by Mix' : 'Manual playlists'}
                  count={row.item_count}
                  poster={row.preview_asset_id ? posterUrl(row.preview_asset_id) : null}
                  flipImages={async () => (row.preview_ids || []).map(posterUrl)}
                  canFlip={canFlip} faces={row.faces || []} onOpenEntity={openEntity}
                  {...(resume ? { onOpen: () => openPlaylist(row.id, resume) } : {})}
                  openLabel={`Open playlist ${name}`}
                  menu={<PlaylistMenu name={name} onRename={() => setRenaming(row)} onDelete={() => remove(row)} onSort={() => setSorting(row)} />} />
              );
            })}
          </div>
        )
        : (
          <EmptyState icon={PLAYLIST} title="No playlists yet"
            actions={<EmptyFocusButton target='[data-playlist-create] input'>New playlist</EmptyFocusButton>}>
            After saving a Mix or creating a list, it continues playing here in your own order.
          </EmptyState>
        )}
      </div>
      <RenameDialog target={renaming} close={() => setRenaming(null)} toast={toast} />
      {sorting ? <PlaylistOrder key={sorting.id} row={sorting} close={() => setSorting(null)} toast={toast} /> : null}
    </div>
  );
}

function PlaylistOrder({ row, close, toast }: { row: PlaylistRow; close(): void; toast: Toast }) {
  const query = useQuery({ queryKey: ['playlist-order', row.id], queryFn: ({ signal }) => fetchPlaylist(row.id, signal),
    staleTime: 0, refetchOnWindowFocus: false, refetchOnReconnect: false });
  const data = query.data;
  if (!data || query.isFetching) return <ModalFrame isOpen onOpenChange={open => { if (!open) close() }} width="form" label="Reorder playback">
    <div className="p-5">{query.isError ? <RetryNote message={errorMessage(query.error)} onRetry={() => void query.refetch()} /> : <p role="status">Reading playlists</p>}
      <Button variant="secondary" onClick={close}>Cancel</Button></div>
  </ModalFrame>;
  return <ObjectOrderDialog title={`Reorder playback · ${row.name}`} close={close}
    items={data.items.map(item => ({ id: String(item.id), name: item.title || item.name || `Video ${item.id}` }))}
    save={async keys => {
      await reorderPlaylist(row.id, keys.map(Number));
      void refreshPlaylists();
      toast('Playback order saved', { undo: undoing(() => reorderPlaylist(row.id, data.items.map(item => item.id))) });
    }} />;
}
