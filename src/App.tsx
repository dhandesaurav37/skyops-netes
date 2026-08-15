/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AuthProvider } from './context/AuthContext';
import { AppShell } from './components/layout/AppShell';

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}

