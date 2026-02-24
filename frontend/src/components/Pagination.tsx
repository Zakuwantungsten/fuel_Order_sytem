import React, { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ChevronDown, Check } from 'lucide-react';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
  onItemsPerPageChange?: (itemsPerPage: number) => void;
  showItemsPerPage?: boolean;
  itemsPerPageOptions?: number[];
}

const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  onPageChange,
  onItemsPerPageChange,
  showItemsPerPage = true,
  itemsPerPageOptions = [10, 25, 50, 100],
}) => {
  const [showPerPageDropdown, setShowPerPageDropdown] = useState(false);
  const [dropdownAlignment, setDropdownAlignment] = useState<'left' | 'right'>('right');
  const [dropdownDirection, setDropdownDirection] = useState<'down' | 'up'>('down');
  const perPageDropdownRef = useRef<HTMLDivElement>(null);
  // Track how many times a page-navigation occurred so the effect fires on
  // every click including when the page number itself doesn't change
  // (e.g. items-per-page change keeps page 1 → still need to scroll).
  const [scrollTick, setScrollTick] = useState(0);

  // Scroll to top after every page navigation, once React has committed the new
  // content to the DOM.  The app uses h-screen + overflow-y-auto on <main>, so
  // the window itself never scrolls — we must scroll the <main> element.
  useEffect(() => {
    if (scrollTick === 0) return; // skip the initial mount
    const mainEl = document.getElementById('main-scroll-container');
    if (mainEl) {
      mainEl.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [scrollTick]);
  
  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);

  // Detect if dropdown would overflow viewport and adjust positioning
  const handleDropdownToggle = () => {
    if (!showPerPageDropdown && perPageDropdownRef.current) {
      const rect = perPageDropdownRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const dropdownWidth = 70; // min-w-[70px]
      const dropdownHeight = 160; // approximate height for 4 options
      const spaceOnRight = viewportWidth - rect.right;
      const spaceBelow = viewportHeight - rect.bottom;

      // If not enough space on right, align to left
      setDropdownAlignment(spaceOnRight < dropdownWidth ? 'left' : 'right');
      // If not enough space below, open upward
      setDropdownDirection(spaceBelow < dropdownHeight ? 'up' : 'down');
    }
    setShowPerPageDropdown(!showPerPageDropdown);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (perPageDropdownRef.current && !perPageDropdownRef.current.contains(event.target as Node)) {
        setShowPerPageDropdown(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Generate page numbers to display
  const getPageNumbers = (): (number | string)[] => {
    const pages: (number | string)[] = [];
    const maxVisible = 5;
    
    if (totalPages <= maxVisible + 2) {
      // Show all pages if total is small
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Always show first page
      pages.push(1);
      
      if (currentPage > 3) {
        pages.push('...');
      }
      
      // Show pages around current page
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
      
      if (currentPage < totalPages - 2) {
        pages.push('...');
      }
      
      // Always show last page
      if (totalPages > 1) {
        pages.push(totalPages);
      }
    }
    
    return pages;
  };

  // Scroll to top of page whenever the user navigates to a different page
  const handlePageChange = (page: number) => {
    setScrollTick((t) => t + 1);
    onPageChange(page);
  };

  if (totalItems === 0) return null;

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between px-4 py-3 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 gap-4">
      {/* Left side - Items info and per page selector */}
      <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4 w-full sm:w-auto">
        <span className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 text-center sm:text-left">
          Showing <span className="font-medium">{startItem}</span> to{' '}
          <span className="font-medium">{endItem}</span> of{' '}
          <span className="font-medium">{totalItems}</span> results
        </span>
        
        {showItemsPerPage && onItemsPerPageChange && (
          <div className="flex items-center gap-2">
            <label className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
              Per page:
            </label>
            <div className="relative" ref={perPageDropdownRef}>
              <button
                type="button"
                onClick={handleDropdownToggle}
                className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md pl-3 pr-8 py-1.5 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 cursor-pointer min-w-[70px] flex items-center justify-between"
              >
                <span className="text-sm">{itemsPerPage}</span>
                <ChevronDown className={`w-3 h-3 absolute right-2 transition-transform ${showPerPageDropdown ? 'rotate-180' : ''}`} />
              </button>
              
              {/* Custom Dropdown Menu */}
              {showPerPageDropdown && (
                <div className={`absolute z-50 ${dropdownAlignment === 'right' ? 'right-0' : 'left-0'} ${dropdownDirection === 'up' ? 'bottom-full mb-1' : 'top-full mt-1'} bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md shadow-lg min-w-[70px] max-w-[calc(100vw-20px)] max-h-[60vh] overflow-y-auto`}>
                  {itemsPerPageOptions.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => {
                        setScrollTick((t) => t + 1);
                        onItemsPerPageChange(option);
                        setShowPerPageDropdown(false);
                      }}
                      className={`w-full px-3 py-2 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center justify-between ${
                        itemsPerPage === option ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400' : 'text-gray-900 dark:text-gray-100'
                      }`}
                    >
                      <span>{option}</span>
                      {itemsPerPage === option && <Check className="w-3 h-3" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Right side - Pagination controls */}
      <div className="flex items-center gap-1">
        {/* First page */}
        <button
          onClick={() => handlePageChange(1)}
          disabled={currentPage === 1}
          className="p-2 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent dark:disabled:hover:bg-transparent transition-colors"
          title="First page"
        >
          <ChevronsLeft className="w-4 h-4" />
        </button>

        {/* Previous page */}
        <button
          onClick={() => handlePageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="p-2 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent dark:disabled:hover:bg-transparent transition-colors"
          title="Previous page"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        {/* Page numbers */}
        <div className="flex items-center gap-1">
          {getPageNumbers().map((page, index) => (
            <React.Fragment key={index}>
              {page === '...' ? (
                <span className="px-2 py-1 text-gray-500 dark:text-gray-400">...</span>
              ) : (
                <button
                  onClick={() => handlePageChange(page as number)}
                  className={`min-w-[32px] h-8 px-2 rounded-md text-sm font-medium transition-colors ${
                    currentPage === page
                      ? 'bg-primary-600 text-white'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  {page}
                </button>
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Next page */}
        <button
          onClick={() => handlePageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="p-2 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent dark:disabled:hover:bg-transparent transition-colors"
          title="Next page"
        >
          <ChevronRight className="w-4 h-4" />
        </button>

        {/* Last page */}
        <button
          onClick={() => handlePageChange(totalPages)}
          disabled={currentPage === totalPages}
          className="p-2 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent dark:disabled:hover:bg-transparent transition-colors"
          title="Last page"
        >
          <ChevronsRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default Pagination;
