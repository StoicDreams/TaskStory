namespace StoicDreams.WebApp.Data;

public interface ITaggedItemValidation
{
	string MyTag { get; }

	string FilterTagName(string name);

	string CreateTagFromName(string name, string prefix);

	bool PersonIsOwner(List<string> tags);

	void AddOwnerIfNone(List<string> tags);

	bool HasContent(string text);

	string RequiresContentMessage(string name);

	string DefaultToDoContent { get; }
	string GetPlaceholder(string postFix);
}
