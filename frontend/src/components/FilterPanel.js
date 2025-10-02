import React from 'react';
import '../styles/FilterPanel.css';

const FilterPanel = ({ filters, onFilterChange, onClearFilters }) => {
  const handleFilterChange = (filterType, value) => {
    onFilterChange({ [filterType]: value });
  };

  return (
    <div className="filter-panel">
      <div className="filter-header">
        <h3>Filters</h3>
        <button 
          className="clear-filters-btn"
          onClick={onClearFilters}
        >
          Clear All
        </button>
      </div>

      <div className="filter-group">
        <label>Call State</label>
        <select 
          value={filters.state || ''}
          onChange={(e) => handleFilterChange('state', e.target.value || null)}
        >
          <option value="">All States</option>
          <option value="completed">Completed</option>
          <option value="missed">Missed</option>
          <option value="cancelled">Cancelled</option>
          <option value="abandoned">Abandoned</option>
          <option value="rejected">Rejected</option>
          <option value="voicemail">Voicemail</option>
        </select>
      </div>

      <div className="filter-group">
        <label>Direction</label>
        <select 
          value={filters.direction || ''}
          onChange={(e) => handleFilterChange('direction', e.target.value || null)}
        >
          <option value="">All Directions</option>
          <option value="inbound">Inbound</option>
          <option value="outbound">Outbound</option>
        </select>
      </div>

      <div className="filter-group">
        <label>Recorded Calls</label>
        <select 
          value={filters.recorded || ''}
          onChange={(e) => handleFilterChange('recorded', e.target.value || null)}
        >
          <option value="">All Calls</option>
          <option value="true">Recorded Only</option>
          <option value="false">Not Recorded</option>
        </select>
      </div>

      <div className="filter-group">
        <label>Duration</label>
        <select 
          value={filters.durationRange || ''}
          onChange={(e) => handleFilterChange('durationRange', e.target.value || null)}
        >
          <option value="">Any Duration</option>
          <option value="short">&lt; 1 minute</option>
          <option value="medium">1-5 minutes</option>
          <option value="long">&gt; 5 minutes</option>
        </select>
      </div>
    </div>
  );
};

export default FilterPanel;