import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RecuperarSenhaPage from '@/pages/RecuperarSenhaPage';

const mocks = vi.hoisted(() => ({ resetPasswordForEmail: vi.fn(), error: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: { resetPasswordForEmail: mocks.resetPasswordForEmail } },
}));
vi.mock('sonner', () => ({ toast: { error: mocks.error } }));

const message = 'Não foi possível enviar o e-mail de recuperação agora. Entre em contato com o administrador.';
beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);

function requestRecovery(email: string) {
  render(<MemoryRouter><RecuperarSenhaPage /></MemoryRouter>);
  fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: email } });
  fireEvent.click(screen.getByRole('button', { name: 'Enviar link' }));
}

describe('recuperação por e-mail com Supabase Auth', () => {
  it.each(['fat3.matriz@topac.com.br', 'financeiro@topac.com.br'])(
    'mantém a chamada Supabase e o redirect oficial para %s', async email => {
      mocks.resetPasswordForEmail.mockResolvedValue({ error: null });
      requestRecovery(email);
      await screen.findByRole('heading', { name: 'Email enviado' });
      expect(mocks.resetPasswordForEmail).toHaveBeenCalledExactlyOnceWith(email, {
        redirectTo: 'https://topacrh.pro/redefinir-senha',
      });
      expect(mocks.error).not.toHaveBeenCalled();
    },
  );

  it('mostra erro amigável para SMTP 535 / HTTP 500 sem afirmar envio', async () => {
    mocks.resetPasswordForEmail.mockResolvedValue({
      error: { status: 500, message: '535 5.7.8 Username and Password not accepted', code: 'unexpected_failure' },
    });
    requestRecovery('fat3.matriz@topac.com.br');
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith(message));
    expect(screen.queryByRole('heading', { name: 'Email enviado' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enviar link' })).toBeEnabled();
    expect(screen.queryByText(/Username and Password/)).not.toBeInTheDocument();
  });

  it('permite repetir a solicitação após uma falha sem deixar o formulário travado', async () => {
    mocks.resetPasswordForEmail.mockRejectedValueOnce(new Error('Failed to fetch'))
      .mockResolvedValueOnce({ error: null });
    requestRecovery('financeiro@topac.com.br');
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith(message));
    expect(screen.queryByRole('heading', { name: 'Email enviado' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Enviar link' }));
    await screen.findByRole('heading', { name: 'Email enviado' });
    expect(mocks.resetPasswordForEmail).toHaveBeenCalledTimes(2);
  });
});
