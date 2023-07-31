using System.Text;

namespace StoicDreams.WebApp.Data;

public class TaggedItemValidation : ITaggedItemValidation
{
	public TaggedItemValidation(IClientAuth auth)
	{
		Auth = auth;
	}

	/// <summary>
	/// Checks if current user is owner.
	/// If no owner is found, than sets current user as owner.
	/// </summary>
	/// <param name="tags"></param>
	/// <returns></returns>
	public bool PersonIsOwner(List<string> tags)
	{
		foreach (string tag in tags)
		{
			if (!tag.StartsWith("person:")) continue;
			if (tag == MyTag) return true;
			return false;
		}
		tags.Add(MyTag);
		return true;
	}

	public string DefaultToDoContent { get; } = string.Empty;
	public string GetPlaceholder(string postFix) => $"TODO: {postFix}";

	public void AddOwnerIfNone(List<string> tags) => PersonIsOwner(tags);

	public bool HasContent(string text) => !string.IsNullOrWhiteSpace(text);

	public string RequiresContentMessage(string name) => $"{name} requires content. Enter N/A if content is not needed or TODO if appropriate information is expected to be added later.";

	public string FilterTagName(string name)
	{
		StringBuilder tag = new();
		char last = '-';
		foreach (char c in name)
		{
			if (!IsValidTagLetter(c, last)) continue;
			last = c;
			tag.Append(c);
		}
		return tag.ToString().ToLower();
	}

	public string CreateTagFromName(string name, string prefix)
	{
		string tag = FilterTagName(name);
		if (tag.Length == 0) return string.Empty;
		return $"{prefix}{tag}".ToLower();
	}

	private static bool IsValidTagLetter(char letter, char last)
	{
		if (char.IsLetterOrDigit(letter)) return true;
		if (letter == last) return false;
		if (ValidTagSpecialCharacters.ContainsKey(letter)) return true;
		return false;
	}

	private static Dictionary<char, bool> ValidTagSpecialCharacters { get; } = new() { { ':', true }, { '-', true }, { '_', true }, { '.', true } };

	public string MyTag => CreateTagFromName(Auth.User.Name, "person:");

	private IClientAuth Auth { get; }
}
