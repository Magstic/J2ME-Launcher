import React from 'react';
import { useTranslation } from '@hooks/useTranslation';

function SearchBar({ searchTerm, onSearchChange, onSearch, gameCount, filteredCount, totalCount, directory }) {
  const { t } = useTranslation();
  const handleChange = (e) => {
    const val = e.target.value;
    if (typeof onSearchChange === 'function') {
      onSearchChange(val);
    } else if (typeof onSearch === 'function') {
      onSearch(val);
    }
  };

  return (
    <div className="search-bar">
      <div className="search-container">
        <input
          type="text"
          className="search-input"
          placeholder={t('searchPlaceholder')}
          value={searchTerm ?? ''}
          onChange={handleChange}
        />
      </div>
    </div>
  );
}

export default SearchBar;
