// Import Vuetify theme for use in style functions
import { useTheme } from 'vuetify/lib/framework.mjs';

// Export a function that returns all the style utilities
// This approach ensures the theme is properly accessed in the component context
export function useStyleUtils() {
  const theme = useTheme();
  const themeColors = theme.themes.value.customTheme.colors;

  return {
    // Main container box style
    getBoxStyle: () => ({
      backgroundColor: themeColors['container'],
      padding: '16px',
      marginBottom: '16px',
      borderRadius: '8px',
    }),

    // Secondary container style (for nested boxes)
    getServerBoxStyle: () => ({
      backgroundColor: themeColors['cell-bg'],
      borderRadius: '8px',
    }),

    // Title and header text style
    getTitleStyle: () => ({
      color: themeColors['text'],
      fontWeight: 'bold',
    }),

    // Normal text style
    getNormalTextStyle: () => ({
      color: themeColors['text'],
    }),

    // Caption/label text style
    getCaptionStyle: () => ({
      color: themeColors['text-light'],
      fontSize: '0.8rem',
    }),

    // Button style overrides
    getButtonStyle: () => ({
      textTransform: 'none',
      fontWeight: '500',
    }),

    // Table style
    getTableStyle: () => ({
      backgroundColor: themeColors['cell-bg'],
      borderRadius: '8px',
      overflow: 'hidden',
    }),

    // Input field style
    getInputStyle: () => ({
      backgroundColor: themeColors['cell-bg'],
      borderRadius: '4px',
    }),

    // Error style
    getErrorStyle: () => {
      return {
        color: theme.global.current.value.colors.error,
        fontFamily: theme.global.current.value.fontFamily
      };
    },

    // Subtitle style
    getSubtitleStyle: () => ({
      fontWeight: '500',
      fontSize: '1.1rem'
    })
  };
} 