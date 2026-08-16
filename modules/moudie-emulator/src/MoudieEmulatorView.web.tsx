import * as React from 'react';

import { MoudieEmulatorViewProps } from './MoudieEmulator.types';

export default function MoudieEmulatorView(props: MoudieEmulatorViewProps) {
  return (
    <div>
      <iframe
        style={{ flex: 1 }}
        src={props.url}
        onLoad={() => props.onLoad?.({ nativeEvent: { url: props.url } })}
      />
    </div>
  );
}
