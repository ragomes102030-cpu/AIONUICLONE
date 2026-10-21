/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Divider, Typography, Button, Switch, Message } from '@arco-design/web-react';
import { Github, Right } from '@icon-park/react';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import classNames from 'classnames';
import { useSettingsViewMode } from '../settingsViewContext';
import { isElectronDesktop, openExternalUrl } from '@/renderer/utils/platform';
import FeedbackReportModal from './FeedbackReportModal';
import { ipcBridge } from '@/common';
import { getIncludePrerelease, runUpdateCheck } from '@/renderer/components/settings/checkForUpdatesShared';
import { UPDATE_AVAILABLE_EVENT } from '@/renderer/components/settings/useUpdateNotificationController';
import { IS_DISCONTINUED_BUILD } from '@/renderer/utils/discontinuedBuild';
import { OPEN_MIGRATION_DIALOG_EVENT } from '@/renderer/components/settings/UpdateMigrationDialog';
import {
  getUpdateReadyState,
  setUpdateReadyState,
  subscribeUpdateReadyState,
  type UpdateReadyState,
} from '@/renderer/components/settings/updateReadyState';

// __APP_VERSION__ is injected by electron.vite.config.ts `define:` from the
// repo-root package.json. The previous `import packageJson from
// '../../../../../../package.json'` resolved to packages/desktop/package.json
// which is a workspace placeholder permanently pinned at "0.0.0".
declare const __APP_VERSION__: string;

type LinkItem =
  | { title: string; url: string; icon: React.ReactNode; onClick?: never }
  | { title: string; onClick: () => void; icon: React.ReactNode; url?: never };

// Direct contact channel for the Arquimedes Civil Engineering edition.
const CONTACT_WHATSAPP_NUMBER = '+55 85 987708-8724';
const CONTACT_WHATSAPP_URL = 'https://wa.me/5585987708724';

const WhatsAppIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox='0 0 24 24' width='20' height='20' className={className} aria-hidden='true' focusable='false'>
    <path
      fill='currentColor'
      d='M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z'
    />
  </svg>
);

const AboutModalContent: React.FC = () => {
  const { t } = useTranslation();
  const viewMode = useSettingsViewMode();
  const isPageMode = viewMode === 'page';
  const isElectron = isElectronDesktop();

  const [includePrerelease, setIncludePrerelease] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [updateReadyState, setLocalUpdateReadyState] = useState<UpdateReadyState>(() => getUpdateReadyState());
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('update.includePrerelease');
    setIncludePrerelease(saved === 'true');
  }, []);

  useEffect(() => subscribeUpdateReadyState(setLocalUpdateReadyState), []);

  const handlePrereleaseChange = (val: boolean) => {
    setIncludePrerelease(val);
    localStorage.setItem('update.includePrerelease', String(val));
  };

  const openLink = async (url: string) => {
    try {
      await openExternalUrl(url);
    } catch (error) {
      console.log('Failed to open link:', error);
    }
  };

  const checkUpdate = async () => {
    // Discontinued build: guide to the AionPro website instead of any in-app
    // version detection. Dead-branched out of normal builds by the flag.
    if (IS_DISCONTINUED_BUILD) {
      window.dispatchEvent(new CustomEvent(OPEN_MIGRATION_DIALOG_EVENT));
      return;
    }

    if (updateReadyState.ready) {
      if (updateReadyState.preparing) return;
      if (updateReadyState.filePath) {
        void ipcBridge.shell.openFile.invoke(updateReadyState.filePath);
        return;
      }
      setUpdateReadyState({ ...updateReadyState, preparing: true });
      void ipcBridge.autoUpdate.quitAndInstall.invoke().catch(() => {
        Message.error(t('update.errors.prepareInstallFailed'));
        setUpdateReadyState({ ...updateReadyState, preparing: false });
      });
      return;
    }

    if (checking) return;
    setChecking(true);
    try {
      const outcome = await runUpdateCheck({
        includePrerelease: getIncludePrerelease(),
        fallbackVersion: __APP_VERSION__,
        checkFailedLabel: t('update.checkFailed'),
      });
      if (outcome.kind === 'available') {
        // Only reveal the bottom-right card once an update is confirmed; hand
        // over the already-fetched outcome so the card skips the checking flash.
        window.dispatchEvent(new CustomEvent(UPDATE_AVAILABLE_EVENT, { detail: outcome }));
      } else if (outcome.kind === 'upToDate') {
        Message.info(t('update.alreadyLatest'));
      } else {
        Message.error(outcome.message || t('update.checkFailed'));
      }
    } finally {
      setChecking(false);
    }
  };

  const linkItems: LinkItem[] = [
    {
      title: t('settings.helpDocumentation'),
      url: 'https://ragomes102030-cpu.github.io/arquimedes/',
      icon: <Right theme='outline' size='16' className='rtl-mirror' />,
    },
    {
      title: t('settings.updateLog'),
      url: 'https://github.com/ragomes102030-cpu/AIONUICLONE/releases',
      icon: <Right theme='outline' size='16' className='rtl-mirror' />,
    },
    {
      title: t('settings.bugReport'),
      onClick: () => setShowFeedbackModal(true),
      icon: <Right theme='outline' size='16' className='rtl-mirror' />,
    },
    {
      title: t('settings.contactWhatsapp', { number: CONTACT_WHATSAPP_NUMBER }),
      url: CONTACT_WHATSAPP_URL,
      icon: <WhatsAppIcon className='text-[#25D366]' />,
    },
    {
      title: t('settings.officialWebsite'),
      url: 'https://ragomes102030-cpu.github.io/arquimedes/',
      icon: <Right theme='outline' size='16' className='rtl-mirror' />,
    },
  ];

  return (
    <div className='flex flex-col h-full w-full'>
      {/* Content Area */}
      <div
        className={classNames(
          'flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-24px',
          isPageMode && 'px-0 overflow-visible'
        )}
      >
        <div className='flex flex-col max-w-500px mx-auto'>
          {/* App Info Section */}
          <div className='flex flex-col items-center pb-24px'>
            <Typography.Title heading={3} className='text-24px font-bold text-t-primary mb-8px'>
              Arquimedes
            </Typography.Title>
            <Typography.Text className='text-14px text-t-secondary mb-12px text-center'>
              {t('settings.appDescription')}
            </Typography.Text>
            <div className='flex items-center justify-center gap-8px mb-16px'>
              <span className='px-10px py-4px rd-6px text-13px bg-fill-2 text-t-primary font-500'>
                v{__APP_VERSION__}
              </span>
              <div
                className='text-t-primary cursor-pointer hover:text-t-secondary transition-colors p-4px'
                onClick={() =>
                  openLink('https://github.com/ragomes102030-cpu/AIONUICLONE').catch((error) =>
                    console.error('Failed to open link:', error)
                  )
                }
              >
                <Github theme='outline' size='20' />
              </div>
            </div>

            {/* Check Update Section */}
            {isElectron && (
              <div className='flex flex-col items-center gap-12px w-full max-w-300px bg-fill-2 p-16px rounded-lg'>
                <Button
                  type='primary'
                  long
                  loading={checking || updateReadyState.preparing}
                  disabled={updateReadyState.preparing}
                  onClick={() => void checkUpdate()}
                >
                  {updateReadyState.preparing
                    ? t('update.preparingInstall')
                    : updateReadyState.ready
                      ? t('settings.updateReadyInstall', { version: updateReadyState.version })
                      : checking
                        ? t('settings.checkingForUpdates')
                        : t('settings.checkForUpdates')}
                </Button>
                <div className='flex items-center justify-between w-full'>
                  <Typography.Text className='text-12px text-t-secondary'>
                    {t('settings.includePrereleaseUpdates')}
                  </Typography.Text>
                  <Switch size='small' checked={includePrerelease} onChange={handlePrereleaseChange} />
                </div>
              </div>
            )}

            {/* Contact Section */}
            <div className='flex flex-col items-center gap-8px w-full max-w-300px bg-fill-2 p-16px rounded-lg mt-12px'>
              <div className='flex items-center gap-8px text-14px font-500 text-t-primary'>
                <WhatsAppIcon className='text-[#25D366]' />
                {t('settings.contactMe')}
              </div>
              <Typography.Text className='text-18px font-600 text-t-primary'>{CONTACT_WHATSAPP_NUMBER}</Typography.Text>
              <Button long onClick={() => void openLink(CONTACT_WHATSAPP_URL)}>
                {t('settings.contactWhatsappCta')}
              </Button>
            </div>
          </div>

          {/* Divider */}
          <Divider className='my-16px' />

          {/* Links Section */}
          <div className='flex flex-col gap-4px pt-8px'>
            {linkItems.map((item, index) => (
              <div
                key={index}
                className='flex items-center justify-between px-16px py-12px rd-8px hover:bg-fill-2 transition-all cursor-pointer group'
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if ('url' in item) {
                    openLink(item.url).catch((error) => console.error('Failed to open link:', error));
                  } else {
                    item.onClick();
                  }
                }}
              >
                <Typography.Text className='text-14px text-t-primary'>{item.title}</Typography.Text>
                <div className='text-t-secondary group-hover:text-t-primary transition-colors'>{item.icon}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <FeedbackReportModal visible={showFeedbackModal} onCancel={() => setShowFeedbackModal(false)} />
    </div>
  );
};

export default AboutModalContent;
