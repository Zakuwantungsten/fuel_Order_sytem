import type { CSSProperties, ReactElement } from 'react';
import { List } from 'react-window';
import type { User } from '../../../../types';
import { TABLE_ROW_HEIGHT } from '../constants';
import UserTableRow from './UserTableRow';
import type { UserAction } from './UserActionsMenu';

interface VirtualUserTableBodyProps {
  users: User[];
  selectedIds: Set<string>;
  onToggleOne: (id: string) => void;
  onRowClick: (user: User) => void;
  onAction: (action: UserAction, user: User) => void;
  maxHeight?: number;
}

interface VirtualRowProps {
  users: User[];
  selectedIds: Set<string>;
  onToggleOne: (id: string) => void;
  onRowClick: (user: User) => void;
  onAction: (action: UserAction, user: User) => void;
}

function VirtualRow({
  index,
  style,
  users,
  selectedIds,
  onToggleOne,
  onRowClick,
  onAction,
}: {
  ariaAttributes: { 'aria-posinset': number; 'aria-setsize': number; role: 'listitem' };
  index: number;
  style: CSSProperties;
} & VirtualRowProps): ReactElement | null {
  const user = users[index];
  const userId = String(user.id || (user as any)._id);

  return (
    <div style={style} role="presentation" aria-hidden="true">
      <UserTableRow
        user={user}
        isSelected={selectedIds.has(userId)}
        onSelect={onToggleOne}
        onRowClick={onRowClick}
        onAction={onAction}
      />
    </div>
  );
}

export default function VirtualUserTableBody({
  users,
  selectedIds,
  onToggleOne,
  onRowClick,
  onAction,
  maxHeight = 600,
}: VirtualUserTableBodyProps) {
  const rowProps: VirtualRowProps = {
    users,
    selectedIds,
    onToggleOne,
    onRowClick,
    onAction,
  };

  return (
    <List<VirtualRowProps>
      rowComponent={VirtualRow}
      rowCount={users.length}
      rowHeight={TABLE_ROW_HEIGHT}
      rowProps={rowProps}
      overscanCount={10}
      style={{ height: Math.min(users.length * TABLE_ROW_HEIGHT, maxHeight) }}
    />
  );
}
