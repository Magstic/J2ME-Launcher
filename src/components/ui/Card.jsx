import React from 'react';

export default function Card({ variant = 'default', className = '', children, ...rest }) {
  const classes = [
    'config-card', // preserve existing hook for styles
    'card',
    variant === 'muted' ? 'card-muted' : null,
    className
  ].filter(Boolean).join(' ');
  return (
    <div className={classes} {...rest}>
      {children}
    </div>
  );
}
