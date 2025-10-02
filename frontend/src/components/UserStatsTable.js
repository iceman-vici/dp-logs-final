import React from 'react';
import '../styles/UserStatsTable.css';

const UserStatsTable = ({ stats, loading }) => {
  if (!stats || stats.length === 0) {
    return (
      <div className="no-data">
        <p>No user statistics available.</p>
      </div>
    );
  }

  return (
    <div className="user-stats-container">
      {loading && <div className="loading-overlay">Updating...</div>}
      
      <div className="table-wrapper">
        <table className="user-stats-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Calls</th>
              <th>Total Duration</th>
              <th>AVG Duration</th>
              <th>Placed</th>
              <th>Answered</th>
              <th>Missed Total</th>
              <th>Missed (No Answer)</th>
              <th>Rejected</th>
              <th>Cancelled</th>
              <th>Abandoned</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((stat, index) => (
              <tr key={stat.user || index}>
                <td className="user-name">{stat.user || 'Unknown'}</td>
                <td className="numeric">{stat.calls}</td>
                <td className="duration">{stat.total_duration}</td>
                <td className="duration">{stat.avg_duration}</td>
                <td className="numeric success">{stat.placed}</td>
                <td className="numeric success">{stat.answered}</td>
                <td className="numeric warning">{stat.missed_total}</td>
                <td className="numeric warning">{stat.missed_ring_no_answer}</td>
                <td className="numeric error">{stat.missed_rejected}</td>
                <td className="numeric">{stat.cancelled}</td>
                <td className="numeric">{stat.abandoned}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      <p className="stats-footer">
        Showing top {stats.length} users by call volume
      </p>
    </div>
  );
};

export default UserStatsTable;