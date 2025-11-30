# Dark Mode Implementation Guide

## Overview

This project now includes comprehensive dark mode functionality integrated directly into the authentication context. The dark mode system provides seamless theme switching across all UI components with persistent user preferences.

## Features

### ✅ Integrated Theme Management
- Dark mode state managed within the `AuthContext`
- Automatic theme persistence across sessions
- System preference detection
- Seamless theme switching without page reload

### ✅ Comprehensive UI Support
- All form elements (inputs, selects, textareas, checkboxes, radios)
- Navigation and sidebar components
- Cards, tables, and modals
- Buttons and interactive elements
- Alerts and status indicators
- Dropdown menus and tooltips

### ✅ Theme Toggle Controls
- Login page theme toggle
- User menu theme switch in Layout component
- Enhanced Dashboard theme controls
- Dedicated ThemeToggle component

### ✅ Automatic Theme Detection
- Detects system dark/light preference
- Preserves user's manual selection
- Applies theme immediately on app load

## Implementation Details

### 1. Authentication Context Integration

The dark mode functionality is integrated into `AuthContext.tsx`:

```typescript
interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  theme: 'light' | 'dark';  // Added theme to auth state
}

interface AuthContextType extends AuthState {
  // ... existing auth methods
  toggleTheme: () => void;
  setTheme: (theme: 'light' | 'dark') => void;
  isDark: boolean;
}
```

### 2. Theme Persistence

Theme preferences are automatically saved and restored:

- **localStorage**: Theme setting persists across browser sessions
- **User Session**: Theme is included in user authentication data
- **System Sync**: Respects system dark/light mode preferences

### 3. CSS Variables and Classes

Enhanced CSS with CSS variables for consistent theming:

```css
html.dark {
  --card-bg: #1f2937;
  --card-border: #374151;
  --text-primary: #f9fafb;
  --input-bg: #374151;
  /* ... more variables */
}

html:not(.dark) {
  --card-bg: #ffffff;
  --card-border: #e5e7eb;
  --text-primary: #111827;
  --input-bg: #ffffff;
  /* ... more variables */
}
```

### 4. Component Usage

Components can access theme functionality through the auth context:

```tsx
import { useAuth } from '../contexts/AuthContext';

function MyComponent() {
  const { theme, toggleTheme, isDark } = useAuth();
  
  return (
    <div className="bg-white dark:bg-gray-800">
      <button onClick={toggleTheme}>
        {isDark ? <Sun /> : <Moon />}
        {isDark ? 'Light Mode' : 'Dark Mode'}
      </button>
    </div>
  );
}
```

## File Changes

### Core Files Modified

1. **`/src/types/index.ts`**
   - Added `theme` property to `AuthUser` and `AuthState` interfaces

2. **`/src/contexts/AuthContext.tsx`**
   - Integrated theme management into authentication flow
   - Added theme actions to reducer
   - Implemented theme persistence and system detection
   - Added DOM theme application logic

3. **`/src/index.css`**
   - Enhanced with comprehensive dark mode CSS variables
   - Added dark mode styles for all UI components
   - Improved transitions and interactive states

### Components Updated

4. **`/src/components/Login.tsx`**
   - Updated to use auth context for theme management
   - Removed dependency on separate ThemeContext

5. **`/src/components/Layout.tsx`**
   - Added theme toggle to user dropdown menu
   - Enhanced with dark mode classes

6. **`/src/components/EnhancedDashboard.tsx`**
   - Updated to use auth context theme functionality

7. **`/src/components/ThemeToggle.tsx`**
   - Updated to use auth context instead of separate ThemeContext

8. **`/src/components/ThemeDebugPanel.tsx`**
   - Updated for auth context theme management

9. **`/src/App.tsx`**
   - Removed separate ThemeProvider (now handled by AuthContext)

### New Components

10. **`/src/components/DarkModeShowcase.tsx`**
    - Comprehensive showcase of all dark mode UI elements
    - Useful for testing and demonstration

## Theme Controls Location

### 1. Login Page
- Top-right corner theme toggle button
- Accessible before authentication

### 2. Main Application (Layout)
- User dropdown menu includes theme toggle
- Available to all authenticated users

### 3. Enhanced Dashboard (Driver/Yard Interface)
- Header theme toggle for role-specific interfaces

## Usage Examples

### Basic Theme Toggle
```tsx
const { toggleTheme, isDark } = useAuth();

<button onClick={toggleTheme}>
  {isDark ? 'Switch to Light' : 'Switch to Dark'}
</button>
```

### Conditional Styling
```tsx
const { isDark } = useAuth();

<div className={`
  card p-4 rounded-lg
  ${isDark 
    ? 'bg-gray-800 text-gray-100 border-gray-700' 
    : 'bg-white text-gray-900 border-gray-200'
  }
`}>
```

### Using CSS Classes (Recommended)
```tsx
<div className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
  Content that automatically adapts to theme
</div>
```

## Dark Mode Classes Reference

### Backgrounds
- `bg-white dark:bg-gray-800` - Main content areas
- `bg-gray-50 dark:bg-gray-900` - Page backgrounds
- `bg-gray-100 dark:bg-gray-700` - Secondary areas

### Text
- `text-gray-900 dark:text-gray-100` - Primary text
- `text-gray-600 dark:text-gray-400` - Secondary text
- `text-gray-500 dark:text-gray-500` - Muted text

### Borders
- `border-gray-200 dark:border-gray-700` - Standard borders
- `border-gray-300 dark:border-gray-600` - Input borders

### Interactive States
- `hover:bg-gray-50 dark:hover:bg-gray-700` - Hover backgrounds
- `focus:ring-blue-500` - Focus states (works in both themes)

## Testing

To test the dark mode implementation:

1. **Theme Persistence**: Toggle theme, refresh page, verify theme persists
2. **System Sync**: Change system theme, reload app without stored preference
3. **Authentication Flow**: Login/logout while preserving theme
4. **Component Coverage**: Use `DarkModeShowcase` component to verify all UI elements
5. **Cross-browser**: Test in different browsers for consistency

## Best Practices

1. **Use Tailwind Dark Classes**: Prefer `dark:` classes over conditional styling
2. **Test Both Themes**: Always verify components work in both light and dark modes  
3. **Consistent Contrast**: Maintain proper contrast ratios in both themes
4. **Smooth Transitions**: Use `transition-colors` for smooth theme changes
5. **Preserve User Choice**: Don't override user's explicit theme selection

## Troubleshooting

### Theme Not Applying
- Check that `html` element has `dark` class in dev tools
- Verify CSS variables are defined
- Ensure Tailwind CSS includes dark mode variants

### Theme Not Persisting
- Check localStorage for `fuel_order_theme` key
- Verify auth context is properly initialized
- Check console for theme-related errors

### Visual Issues
- Review contrast ratios for accessibility
- Check that all interactive states have dark variants
- Verify print styles work correctly in both themes

## Future Enhancements

- [ ] Add high contrast theme option
- [ ] Implement custom color themes
- [ ] Add theme transition animations
- [ ] Support for reduced motion preferences
- [ ] Theme-aware chart and graph colors

## Migration Notes

If upgrading from the previous separate ThemeContext implementation:

1. Remove `ThemeProvider` wrapper from components
2. Update imports from `useTheme` to `useAuth` 
3. Destructure theme properties from auth context
4. Remove standalone ThemeContext if no longer needed

The new integrated approach provides better DX and ensures theme state is always available alongside user authentication status.