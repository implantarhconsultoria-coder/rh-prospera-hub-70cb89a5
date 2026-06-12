import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CameraCapture from '@/app-mecanico/components/CameraCapture';

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) => open ? <>{children}</> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe('CameraCapture', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('interrompe a câmera se o diálogo fechar enquanto a permissão está pendente', async () => {
    let resolveStream: (stream: MediaStream) => void = () => undefined;
    const track = { stop: vi.fn() } as unknown as MediaStreamTrack;
    const stream = { getTracks: () => [track] } as unknown as MediaStream;
    const getUserMedia = vi.fn(() => new Promise<MediaStream>((resolve) => { resolveStream = resolve; }));
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    });

    const props = { onClose: vi.fn(), onCapture: vi.fn(), title: 'Foto de teste' };
    const view = render(<CameraCapture open {...props} />);
    expect(getUserMedia).toHaveBeenCalledOnce();

    view.rerender(<CameraCapture open={false} {...props} />);
    resolveStream(stream);

    await waitFor(() => expect(track.stop).toHaveBeenCalledOnce());
  });
});
