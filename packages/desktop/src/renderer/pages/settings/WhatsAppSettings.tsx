/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import WhatsappModalContent from '@/renderer/components/settings/SettingsModal/contents/WhatsappModalContent';
import SettingsPageWrapper from './components/SettingsPageWrapper';

/**
 * Configuracoes do agente de WhatsApp (estacao de leitura + resumo).
 * A sessao do WhatsApp fica no Chrome em modo depuracao; o app so
 * le o estado, liga e desliga as tarefas agendadas.
 */
const WhatsAppSettings: React.FC = () => {
  return (
    <SettingsPageWrapper>
      <WhatsappModalContent />
    </SettingsPageWrapper>
  );
};

export default WhatsAppSettings;
