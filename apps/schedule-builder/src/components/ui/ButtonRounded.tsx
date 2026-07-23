interface props {
  onClick?: () => void;
  className?: string;
  text?: string;
}

export const Button = ({ onClick, className, text }: props) => {
  return (
    <button
      className={`bg-red-700 rounded-full px-2 py-2 font-semibold ${className} text-white`}
      onClick={onClick}
    >
      {text}
    </button>
  );
};
