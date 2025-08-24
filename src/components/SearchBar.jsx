import React from 'react';

function SearchBar({ searchTerm, onSearchChange, onSearch, gameCount, filteredCount, totalCount, directory }) {
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
          placeholder="搜索遊戲名稱、開發商或版本..."
          value={searchTerm ?? ''}
          onChange={handleChange}
        />
      </div>
    </div>
  );
}

export default SearchBar;
