// Theme Toggle Test Script
// This script checks if dark mode classes are properly applied

console.log('=== FUEL ORDER THEME DEBUG ===');

// Check if we're in browser environment
if (typeof document !== 'undefined') {
  const html = document.documentElement;
  
  console.log('Current HTML classes:', html.className);
  console.log('Has dark class:', html.classList.contains('dark'));
  
  // Check localStorage
  const storedTheme = localStorage.getItem('fuel_order_theme');
  console.log('Stored theme:', storedTheme);
  
  // Check CSS styles
  const bodyStyles = getComputedStyle(document.body);
  console.log('Body background color:', bodyStyles.backgroundColor);
  console.log('Body text color:', bodyStyles.color);
  
  // Test theme toggle functionality
  window.testThemeToggle = function() {
    console.log('--- Testing Theme Toggle ---');
    
    const wasLight = !html.classList.contains('dark');
    console.log('Before toggle - is light mode:', wasLight);
    
    // Toggle
    html.classList.toggle('dark');
    
    const isNowDark = html.classList.contains('dark');
    console.log('After toggle - is dark mode:', isNowDark);
    
    // Check if background actually changed
    setTimeout(() => {
      const newBodyStyles = getComputedStyle(document.body);
      console.log('New body background:', newBodyStyles.backgroundColor);
      console.log('New body color:', newBodyStyles.color);
    }, 100);
  };
  
  console.log('Run testThemeToggle() in console to test theme switching');
} else {
  console.log('Not in browser environment');
}