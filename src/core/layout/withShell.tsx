import React from 'react';
import { Shell } from './Shell';
export function withShell(Screen: React.ComponentType) {
  return function ScreenWithShell() {
    return (
      <Shell>
        <Screen />
      </Shell>
    );
  };
}
