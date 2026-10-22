/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Settings → WebUI → WhatsApp tab.
 *
 * Read-only status of the WhatsApp station plus the on/off switch of the
 * summary tasks. The app never installs anything by itself: the station is
 * set up on the machine with a single command (`npm run station:whatsapp`),
 * and this panel only tells the user what is missing.
 */

import { shell, whatsapp, type IWhatsAppStationStatus } from '@/common/adapter/ipcBridge';
import AionScrollArea from '@/renderer/components/base/AionScrollArea';
import { Button, Message, Spin, Switch, Tooltip } from '@arco-design/web-react';
import { Communication, Refresh } from '@icon-park/react';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

const WHATSAPP_WEB_URL = 'https://web.whatsapp.com/';

const StatusDot: React.FC<{ ok: boolean }> = ({ ok }) => (
  <span
    className='inline-block w-8px h-8px rd-50% shrink-0'
    style={{ background: ok ? 'rgb(var(--green-6))' : 'rgb(var(--red-6))' }}
    aria-hidden
  />
);

const StatusRow: React.FC<{ label: string; value?: React.ReactNode; ok?: boolean }> = ({ label, value, ok }) => (
  <div className='flex items-center justify-between gap-12px py-8px'>
    <div className='flex items-center gap-8px min-w-0'>
      {ok === undefined ? null : <StatusDot ok={ok} />}
      <span className='text-13px text-t-primary'>{label}</span>
    </div>
    <div className='text-12px text-t-tertiary text-right truncate'>{value ?? '-'}</div>
  </div>
);

const formatWhen = (ms?: number): string => {
  if (!ms) return '-';
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return '-';
  }
};

const WhatsappModalContent: React.FC = () => {
  const { t } = useTranslation();
  const [status, setStatus] = useState<IWhatsAppStationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = await whatsapp.getStationStatus.invoke();
      setStatus(next);
    } catch (error) {
      Message.error(
        t('settings.whatsapp.checkFailed', 'Nao foi possivel ler o status da estacao') +
          (error instanceof Error ? `: ${error.message}` : '')
      );
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const toggleTask = useCallback(
    async (jobId: string, enabled: boolean) => {
      setToggling(jobId);
      try {
        await whatsapp.setTaskEnabled.invoke({ job_id: jobId, enabled });
        await refresh();
        Message.success(
          enabled ? t('settings.whatsapp.taskEnabled', 'Tarefa ativada') : t('settings.whatsapp.taskDisabled', 'Tarefa desativada')
        );
      } catch (error) {
        Message.error(
          t('settings.whatsapp.toggleFailed', 'Nao foi possivel mudar a tarefa') +
            (error instanceof Error ? `: ${error.message}` : '')
        );
      } finally {
        setToggling(null);
      }
    },
    [refresh, t]
  );

  const openWhatsAppWeb = useCallback(async () => {
    try {
      await shell.openExternal.invoke(WHATSAPP_WEB_URL);
    } catch {
      Message.error(t('settings.whatsapp.openFailed', 'Nao foi possivel abrir o navegador'));
    }
  }, [t]);

  const healthy = Boolean(status && status.issues.length === 0);

  return (
    <AionScrollArea className='px-[12px] md:px-[28px] py-16px'>
      <div className='flex flex-col gap-14px'>
        <div className='flex items-start justify-between gap-12px'>
          <div className='min-w-0'>
            <div className='flex items-center gap-8px text-15px font-600 text-t-primary'>
              <Communication theme='outline' size='16' />
              <span>{t('settings.whatsapp.title', 'Estacao WhatsApp')}</span>
            </div>
            <p className='text-12px text-t-tertiary mt-4px'>
              {t(
                'settings.whatsapp.description',
                'A estacao le o grupo do WhatsApp pelo Chrome em modo de depuracao e gera o resumo diario e semanal.'
              )}
            </p>
          </div>
          <Tooltip>
            <button
              type='button'
              className='inline-flex items-center justify-center w-28px h-28px rd-6px hover:bg-fill-2'
              onClick={() => void refresh()}
              aria-label={t('settings.whatsapp.refresh', 'Verificar agora')}
            >
              <Refresh size={16} className={loading ? 'animate-spin' : ''} />
            </button>
          </Tooltip>
        </div>

        {loading && !status ? (
          <div className='flex items-center justify-center py-24px'>
            <Spin />
          </div>
        ) : (
          <>
            <div className='rd-8px border border-line bg-fill-1 px-14px py-10px'>
              <div className='flex items-center gap-8px mb-6px'>
                <StatusDot ok={healthy} />
                <span className='text-13px font-600 text-t-primary'>
                  {healthy
                    ? t('settings.whatsapp.stationReady', 'Estacao pronta')
                    : t('settings.whatsapp.stationNeedsAttention', 'Estacao precisa de atencao')}
                </span>
              </div>
              {status?.issues.map((issue, index) => (
                <div key={index} className='text-12px text-t-secondary leading-18px'>
                  • {issue}
                </div>
              ))}
            </div>

            <div className='rd-8px border border-line bg-fill-1 px-14px py-4px'>
              <StatusRow
                label={t('settings.whatsapp.chrome', 'Chrome em depuracao')}
                value={status?.chrome.version || '-'}
                ok={Boolean(status?.chrome.connected)}
              />
              <StatusRow
                label={t('settings.whatsapp.whatsappTab', 'Aba do WhatsApp aberta')}
                value={status?.chrome.tabs ? `${status.chrome.tabs} aba(s)` : '-'}
                ok={Boolean(status?.chrome.whatsappTab)}
              />
              <StatusRow
                label={t('settings.whatsapp.session', 'Sessao conectada')}
                value={status?.chrome.error || '-'}
                ok={Boolean(status?.chrome.sessionActive)}
              />
              <StatusRow
                label={t('settings.whatsapp.account', 'Conta conectada')}
                value={status?.chrome.conta || '-'}
                ok={Boolean(status?.chrome.conta)}
              />
              <StatusRow
                label={t('settings.whatsapp.conversations', 'Conversas na lista')}
                value={status?.chrome.conversas !== undefined ? `${status.chrome.conversas}` : '-'}
                ok={Boolean(status?.chrome.conversas)}
              />
              <StatusRow
                label={t('settings.whatsapp.unread', 'Mensagens nao lidas')}
                value={status?.chrome.naoLidas !== undefined ? `${status.chrome.naoLidas}` : '-'}
                ok={Boolean(status?.chrome.naoLidas)}
              />
            </div>

            <div className='rd-8px border border-line bg-fill-1 px-14px py-4px'>
              <StatusRow
                label={t('settings.whatsapp.skill', 'Skill do agente')}
                value={status?.skill.registered ? t('settings.whatsapp.registered', 'registrada') : '-'}
                ok={Boolean(status?.skill.installed && status?.skill.registered)}
              />
              <StatusRow
                label={t('settings.whatsapp.catalog', 'Catalogo de skills')}
                value={
                  status
                    ? `${status.catalog.total - status.catalog.broken}/${status.catalog.total} ok`
                    : '-'
                }
                ok={Boolean(status && status.catalog.broken === 0)}
              />
            </div>

            <div>
              <div className='text-13px font-600 text-t-primary mb-4px'>
                {t('settings.whatsapp.tasks', 'Tarefas de resumo')}
              </div>
              {status && status.tasks.length === 0 ? (
                <div className='text-12px text-t-tertiary py-8px'>
                  {t('settings.whatsapp.noTasks', 'Nenhuma tarefa cadastrada.')}
                </div>
              ) : null}
              {status?.tasks.map((task) => (
                <div key={task.id} className='flex items-center justify-between gap-12px py-8px'>
                  <div className='min-w-0'>
                    <div className='text-13px text-t-primary truncate'>{task.name}</div>
                    <div className='text-12px text-t-tertiary'>
                      {task.expr || '-'}
                      {task.nextRunAtMs
                        ? ` · ${t('settings.whatsapp.nextRun', 'proxima')} ${formatWhen(task.nextRunAtMs)}`
                        : ''}
                    </div>
                  </div>
                  <Switch
                    size='small'
                    checked={task.enabled}
                    loading={toggling === task.id}
                    onChange={(checked) => void toggleTask(task.id, checked)}
                  />
                </div>
              ))}
            </div>

            <div className='flex items-center gap-8px flex-wrap'>
              <Button size='small' type='primary' onClick={() => void openWhatsAppWeb()}>
                {t('settings.whatsapp.openWeb', 'Abrir WhatsApp Web')}
              </Button>
              <Button size='small' onClick={() => void refresh()} loading={loading}>
                {t('settings.whatsapp.refresh', 'Verificar agora')}
              </Button>
            </div>

            <div className='rd-8px border border-line bg-fill-2 px-14px py-10px'>
              <div className='text-12px font-600 text-t-secondary mb-4px'>
                {t('settings.whatsapp.installTitle', 'Como deixar pronto')}
              </div>
              <div className='text-12px text-t-tertiary leading-18px'>
                {t(
                  'settings.whatsapp.installHint',
                  'Na pasta do aplicativo, rode "npm run station:whatsapp". O comando instala a skill, cria as tarefas e sobe o Chrome com o WhatsApp Web.'
                )}
              </div>
            </div>

            <div className='rd-8px border border-line bg-fill-2 px-14px py-10px'>
              <div className='text-12px font-600 text-t-secondary mb-4px'>
                {t('settings.whatsapp.warningsTitle', 'Avisos importantes')}
              </div>
              <ul className='text-12px text-t-tertiary leading-18px ps-16px'>
                <li>{t('settings.whatsapp.warning1', 'Use um numero dedicado, nunca o pessoal — automacao pode banir.')}</li>
                <li>{t('settings.whatsapp.warning2', 'A ferramenta le e resume; o envio de mensagem e opcional.')}</li>
                <li>{t('settings.whatsapp.warning3', 'Nao e API oficial: usa o DevTools do Chrome.')}</li>
                <li>{t('settings.whatsapp.warning4', 'O Chrome precisa ficar aberto com o WhatsApp Web logado.')}</li>
                <li>{t('settings.whatsapp.warning5', 'No escopo global o resumo usa a previa das conversas da lista, sem abrir nenhuma.')}</li>
                <li>{t('settings.whatsapp.warning6', 'Vale para qualquer conta conectada no Chrome da estacao — nada fica preso a um numero.')}</li>
              </ul>
            </div>
          </>
        )}
      </div>
    </AionScrollArea>
  );
};

export default WhatsappModalContent;
